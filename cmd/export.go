package cmd

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strings"

	"github.com/Enkryptify/cli/api"
	"github.com/Enkryptify/cli/utils/config"
	"github.com/Enkryptify/cli/utils/encryption"
	"github.com/spf13/cobra"
)

type ExportFormat string

const (
	FileFormat ExportFormat = "file"
	JSONFormat ExportFormat = "json"
	EnvFormat  ExportFormat = "env"
)

type ExportConfig struct {
	Format   ExportFormat
	Select   []string
	Exclude  []string
	Secrets  []api.Secret
	Platform string
}

func init() {
	exportCmd.Flags().String("format", "", "Output format (file, json, or env)")
	exportCmd.Flags().String("select", "", "Comma-separated list of secrets to export")
	exportCmd.Flags().String("exclude", "", "Comma-separated list of secrets to exclude")
	exportCmd.MarkFlagRequired("format")
	rootCmd.AddCommand(exportCmd)
}

var exportCmd = &cobra.Command{
	Use:   "export",
	Short: "Export secrets in different formats",
	Example: `  enkryptify export --format=file > ./secrets.env
  enkryptify export --format=json > ./secrets.json
  source <(enkryptify export --format=env)
  source <(enkryptify export --format=env --select=API_KEY,DB_PASSWORD)
  enkryptify export --format=json --exclude=SENSITIVE_KEY`,
	RunE: func(cmd *cobra.Command, args []string) error {
		format, _ := cmd.Flags().GetString("format")
		selectStr, _ := cmd.Flags().GetString("select")
		excludeStr, _ := cmd.Flags().GetString("exclude")

		if format == "" {
			return fmt.Errorf("--format flag is required")
		}

		exportConfig := ExportConfig{
			Format:   ExportFormat(format),
			Platform: runtime.GOOS,
		}

		if selectStr != "" {
			exportConfig.Select = strings.Split(selectStr, ",")
			for i, s := range exportConfig.Select {
				exportConfig.Select[i] = strings.TrimSpace(s)
			}
		}

		if excludeStr != "" {
			exportConfig.Exclude = strings.Split(excludeStr, ",")
			for i, e := range exportConfig.Exclude {
				exportConfig.Exclude[i] = strings.TrimSpace(e)
			}
		}

		switch exportConfig.Format {
		case FileFormat, JSONFormat, EnvFormat:
		default:
			return fmt.Errorf("invalid format '%s'. Must be one of: file, json, env", format)
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

		decryptedSecrets := make(map[string]string)
		for _, secret := range secrets.Data {
			if !exportConfig.shouldIncludeSecret(secret) {
				continue
			}

			decryptedValue, err := encryption.DecryptSecretValue(secret.Value, projectKeyBytes[:])
			if err != nil {
				return fmt.Errorf("error decrypting secret %s: %v", secret.Name, err)
			}
			decryptedSecrets[secret.Name] = decryptedValue
		}

		if err := exportSecrets(exportConfig, decryptedSecrets); err != nil {
			return fmt.Errorf("error exporting secrets: %v", err)
		}

		return nil
	},
}

func (c *ExportConfig) shouldIncludeSecret(secret api.Secret) bool {
	if len(c.Select) > 0 {
		for _, s := range c.Select {
			if s == secret.Name {
				return true
			}
		}
		return false
	}

	if len(c.Exclude) > 0 {
		for _, e := range c.Exclude {
			if e == secret.Name {
				return false
			}
		}
	}

	return true
}

func formatEnvVariable(name, value string, format ExportFormat, platform string) string {
	switch format {
	case FileFormat:
		value = strings.ReplaceAll(value, "\"", "\\\"")
		return fmt.Sprintf("%s=\"%s\"", name, value)
	case EnvFormat:
		switch platform {
		case "windows":
			return fmt.Sprintf("set %s=%s", name, value)
		case "plan9":
			return fmt.Sprintf("%s='%s'", name, value)
		default:
			value = strings.ReplaceAll(value, "'", "'\\''")
			return fmt.Sprintf("export %s='%s'", name, value)
		}
	default:
		return ""
	}
}

func exportSecrets(cfg ExportConfig, decryptedSecrets map[string]string) error {
	switch cfg.Format {
	case FileFormat:
		for name, value := range decryptedSecrets {
			if _, err := fmt.Println(formatEnvVariable(name, value, FileFormat, cfg.Platform)); err != nil {
				return err
			}
		}

	case JSONFormat:
		output := make(map[string]string)
		for name, value := range decryptedSecrets {
			output[name] = value
		}
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(output); err != nil {
			return err
		}

	case EnvFormat:
		for name, value := range decryptedSecrets {
			if _, err := fmt.Println(formatEnvVariable(name, value, EnvFormat, cfg.Platform)); err != nil {
				return err
			}
		}

	default:
		return fmt.Errorf("unsupported format: %s", cfg.Format)
	}

	return nil
}
