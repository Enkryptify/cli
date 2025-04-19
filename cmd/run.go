package cmd

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/Enkryptify/cli/api"
	"github.com/Enkryptify/cli/utils/config"
	"github.com/Enkryptify/cli/utils/encryption"
	"github.com/spf13/cobra"
)

func init() {
	runCmd.Flags().StringP("command", "c", "", "Command to execute (can include multiple commands with &&, ; or ||)")
	rootCmd.AddCommand(runCmd)
}

var runCmd = &cobra.Command{
	Use:   "run [-- command args...]",
	Short: "Inject your secrets into your project",
	Example: `  enkryptify run -- npm run start
  enkryptify run -- node server.js
  enkryptify run --command="npm run build && npm run start"`,
	RunE: func(cmd *cobra.Command, args []string) error {
		command, _ := cmd.Flags().GetString("command")

		if command == "" && len(args) == 0 {
			return fmt.Errorf("either provide a command with --command or arguments after --")
		}

		if runtime.GOOS == "ios" || runtime.GOOS == "android" ||
			runtime.GOOS == "js" || runtime.GOOS == "wasip1" {
			return fmt.Errorf("this command is not supported on %s, please email us at support@enkryptify.com", runtime.GOOS)
		}

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("error getting current directory: %v", err)
		}

		cm, err := config.NewConfigManager()
		if err != nil {
			return fmt.Errorf("error creating config manager: %v", err)
		}

		cfg, token, projectKey, err := cm.GetConfig(cwd)
		if err != nil {
			return fmt.Errorf("no configuration found for directory %s: %v", cwd, err)
		}

		client := api.NewClient(token)
		ctx := context.Background()

		var pr api.ProjectResponse
		if err := client.GetProjectByID(ctx, cfg.ProjectID, &pr); err != nil {
			return fmt.Errorf("error fetching project info: %v", err)
		}
		e2ee := pr.Data.EndToEndEncryption

		var secrets api.SecretResponse
		if err := client.GetSecrets(ctx, cfg.ProjectID, cfg.EnvironmentID, &secrets); err != nil {
			return fmt.Errorf("error getting secrets: %v", err)
		}

		// prepare environment with (possibly decrypted) secrets
		env := os.Environ()
		if e2ee {
			parts := strings.Split(token, "_")
			privateKey := base64.StdEncoding.EncodeToString([]byte(parts[1]))
			decryptor, err := encryption.NewDecryptor(privateKey, cfg.PublicKey)
			if err != nil {
				return fmt.Errorf("error creating decryption service: %v", err)
			}
			projectKeyDecrypted, err := decryptor.Decrypt(projectKey)
			if err != nil {
				return fmt.Errorf("error decrypting project key: %v", err)
			}
			keyBytes := []byte(projectKeyDecrypted)
			for _, secret := range secrets.Data {
				dv, err := encryption.DecryptSecretValue(secret.Value, keyBytes)
				if err != nil {
					return fmt.Errorf("error decrypting secret %s: %v", secret.Name, err)
				}
				env = append(env, fmt.Sprintf("%s=%s", secret.Name, dv))
			}
		} else {
			for _, secret := range secrets.Data {
				env = append(env, fmt.Sprintf("%s=%s", secret.Name, secret.Value))
			}
		}

		// finally run the user’s command with our augmented env
		if err := runCommand(command, args, env, cwd); err != nil {
			return fmt.Errorf("error running command: %v", err)
		}
		return nil
	},
}

func getShellAndFlag() (shell string, flag string) {
	switch runtime.GOOS {
	case "windows":
		if _, err := exec.LookPath("powershell.exe"); err == nil {
			return "powershell.exe", "-Command"
		}
		return "cmd.exe", "/C"
	case "plan9":
		return "rc", "-c"
	case "ios", "android", "js", "wasip1":
		return "", ""
	default:
		candidates := []struct{ path, flag string }{
			{"bash", "-c"}, {"zsh", "-c"}, {"ksh", "-c"},
			{"ash", "-c"}, {"sh", "-c"},
		}
		for _, c := range candidates {
			if _, err := exec.LookPath(c.path); err == nil {
				return c.path, c.flag
			}
		}
		return "sh", "-c"
	}
}

func runCommand(command string, args []string, env []string, cwd string) error {
	if runtime.GOOS == "ios" || runtime.GOOS == "android" ||
		runtime.GOOS == "js" || runtime.GOOS == "wasip1" {
		return fmt.Errorf("running commands is not supported on %s", runtime.GOOS)
	}

	var proc *exec.Cmd
	if command != "" {
		shell, shellArg := getShellAndFlag()
		if shell == "" {
			return fmt.Errorf("no suitable shell found for this platform")
		}
		// normalize && on various shells
		switch {
		case shell == "powershell.exe":
			command = strings.ReplaceAll(command, "&&", ";")
		case shell == "rc":
			command = strings.ReplaceAll(command, "&&", " && ")
		}
		proc = exec.Command(shell, shellArg, command)
	} else {
		exe := args[0]
		// Docker fallback
		if _, err := os.Stat("/.dockerenv"); err == nil {
			if p, err := exec.LookPath(exe); err == nil {
				exe = p
			}
		}
		// Windows extensions
		if runtime.GOOS == "windows" && !strings.Contains(exe, ".") {
			for _, ext := range []string{".exe", ".cmd", ".bat"} {
				if p, err := exec.LookPath(exe + ext); err == nil {
					exe = p
					break
				}
			}
		}
		proc = exec.Command(exe, args[1:]...)
	}

	proc.Env = env
	proc.Dir = cwd
	proc.Stdin = os.Stdin
	proc.Stdout = os.Stdout
	proc.Stderr = os.Stderr

	// set up process group on Unix, no‑op on Windows
	if p := newSysProcAttr(); p != nil {
		proc.SysProcAttr = p
	}

	// signal handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	var procErr error

	go func() {
		select {
		case <-sigChan:
			cancel()
			killProcessGroup(proc)
			signal.Stop(sigChan)
			select {
			case <-done:
			case <-time.After(500 * time.Millisecond):
				if proc.Process != nil {
					_ = proc.Process.Kill()
				}
			}
		case <-ctx.Done():
		}
	}()

	if err := proc.Start(); err != nil {
		close(done)
		return fmt.Errorf("error starting command: %v", err)
	}

	go func() {
		procErr = proc.Wait()
		close(done)
	}()

	<-done

	if procErr != nil {
		if exitError, ok := procErr.(*exec.ExitError); ok {
			switch runtime.GOOS {
			case "windows":
				os.Exit(exitError.ExitCode())
			case "plan9":
				if st, ok := exitError.Sys().(syscall.WaitStatus); ok {
					os.Exit(st.ExitStatus())
				}
			default:
				if st, ok := exitError.Sys().(syscall.WaitStatus); ok {
					os.Exit(st.ExitStatus())
				}
			}
		}
		return fmt.Errorf("error running command: %v", procErr)
	}
	return nil
}
