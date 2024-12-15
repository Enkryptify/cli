package cmd

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"

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

		projectKeyBytes := []byte(projectKeyDecrypted)

		client := api.NewClient(token)
		ctx := context.Background()

		var secrets api.SecretResponse
		if err := client.GetSecrets(ctx, cfg.ProjectID, cfg.EnvironmentID, &secrets); err != nil {
			return fmt.Errorf("error getting secrets: %v", err)
		}

		env := os.Environ()
		for _, secret := range secrets.Data {
			decryptedValue, err := encryption.DecryptSecretValue(secret.Value, projectKeyBytes[:])
			if err != nil {
				return fmt.Errorf("error decrypting secret %s: %v", secret.Name, err)
			}
			env = append(env, fmt.Sprintf("%s=%s", secret.Name, decryptedValue))
		}

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
		shells := []struct {
			path string
			flag string
		}{
			{"bash", "-c"},
			{"zsh", "-c"},
			{"ksh", "-c"},
			{"ash", "-c"},
			{"sh", "-c"},
		}

		for _, s := range shells {
			if _, err := exec.LookPath(s.path); err == nil {
				return s.path, s.flag
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

		switch {
		case shell == "powershell.exe":
			command = strings.ReplaceAll(command, "&&", ";")
		case shell == "rc": // Plan 9
			command = strings.ReplaceAll(command, "&&", " && ")
		}

		proc = exec.Command(shell, shellArg, command)
	} else {
		executable := args[0]
		if _, err := os.Stat("/.dockerenv"); err == nil {
			if path, err := exec.LookPath(executable); err == nil {
				executable = path
			}
		}

		if runtime.GOOS == "windows" {
			if !strings.Contains(executable, ".") {
				for _, ext := range []string{".exe", ".cmd", ".bat"} {
					if path, err := exec.LookPath(executable + ext); err == nil {
						executable = path
						break
					}
				}
			}
		}

		proc = exec.Command(executable, args[1:]...)
	}

	proc.Env = env
	proc.Dir = cwd
	proc.Stdin = os.Stdin
	proc.Stdout = os.Stdout
	proc.Stderr = os.Stderr

	err := proc.Run()
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			switch runtime.GOOS {
			case "windows":
				os.Exit(exitError.ExitCode())
			case "plan9":
				if status, ok := exitError.Sys().(syscall.WaitStatus); ok {
					os.Exit(status.ExitStatus())
				}
			default:
				if status, ok := exitError.Sys().(syscall.WaitStatus); ok {
					os.Exit(status.ExitStatus())
				}
			}
		}
		return fmt.Errorf("error running command: %v", err)
	}

	return nil
}
