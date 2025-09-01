package inject

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"github.com/Enkryptify/cli/internal/providers/enkryptify"
)

// SecretToEnvVar converts a secret to environment variable format
func SecretToEnvVar(secret enkryptify.Secret, environmentID string) (string, string, error) {
	// Find the value for the specific environment
	for _, value := range secret.Values {
		if value.EnvironmentID == environmentID {
			return secret.Name, value.Value, nil
		}
	}
	
	return "", "", fmt.Errorf("no value found for secret %s in environment %s", secret.Name, environmentID)
}

// InjectSecretsAndRun fetches secrets and runs the command with them as environment variables
func InjectSecretsAndRun(workspaceSlug, projectSlug, environmentID string, command []string) error {
	if len(command) == 0 {
		return fmt.Errorf("no command provided")
	}

	// Create enkryptify client
	client := enkryptify.NewClient()

	// Fetch secrets
	secrets, err := client.GetSecrets(workspaceSlug, projectSlug, environmentID)
	if err != nil {
		return fmt.Errorf("failed to fetch secrets: %w", err)
	}

	// Convert secrets to environment variables
	envVars := os.Environ() // Start with current environment
	
	for _, secret := range secrets {
		name, value, err := SecretToEnvVar(secret, environmentID)
		if err != nil {
			// Log warning but don't fail - secret might not have value for this environment
			continue
		}
		envVars = append(envVars, fmt.Sprintf("%s=%s", name, value))
	}

	// Prepare command
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Env = envVars
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	// Run command and wait for completion
	if err := cmd.Run(); err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			// Command failed with non-zero exit code
			if status, ok := exitError.Sys().(syscall.WaitStatus); ok {
				os.Exit(status.ExitStatus())
			}
		}
		return fmt.Errorf("failed to execute command: %w", err)
	}

	return nil
}
