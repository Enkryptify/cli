package cmd

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strings"

	"github.com/Enkryptify/cli/api"
	"github.com/Enkryptify/cli/utils/config"
	"github.com/Enkryptify/cli/utils/encryption"
	"github.com/Enkryptify/cli/utils/keys"
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
  enkryptify export --format=env
  enkryptify export --format=env --select=API_KEY,DB_PASSWORD
  enkryptify export --format=json --exclude=SENSITIVE_KEY`,
	Run: func(cmd *cobra.Command, args []string) {
		format, _ := cmd.Flags().GetString("format")
		selectStr, _ := cmd.Flags().GetString("select")
		excludeStr, _ := cmd.Flags().GetString("exclude")

		if format == "" {
			fmt.Println("Error: --format flag is required")
			cmd.Help()
			os.Exit(1)
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
			// Valid format
		default:
			fmt.Printf("Error: invalid format '%s'. Must be one of: file, json, env\n", format)
			os.Exit(1)
		}

		cwd, err := os.Getwd()
		if err != nil {
			fmt.Printf("Error getting current directory: %v\n", err)
			os.Exit(1)
		}

		cm, err := config.NewConfigManager()
		if err != nil {
			fmt.Printf("Error creating config manager: %v\n", err)
			os.Exit(1)
		}

		cfg, projectKey, err := cm.GetConfig(cwd)
		if err != nil {
			fmt.Printf("No configuration found for directory %s: %v\n", cwd, err)
			os.Exit(1)
		}

		key, err := keys.GetAPIKey()
		if err != nil {
			fmt.Println("No API key found")
			os.Exit(1)
		}

		privateKey := sha256.Sum256([]byte(key))
		decryptor, err := encryption.NewDecryptor(privateKey, cfg.PublicKey)
		if err != nil {
			fmt.Printf("Error creating decryption service: %v\n", err)
			os.Exit(1)
		}

		projectKeyDecrypted, err := decryptor.Decrypt(projectKey)
		if err != nil {
			fmt.Printf("Error decrypting project key: %v\n", err)
			os.Exit(1)
		}

		projectKeyBytes := sha256.Sum256([]byte(projectKeyDecrypted))

		// client := api.NewClient(key)
		// ctx := context.Background()

		var secrets api.SecretResponse = api.SecretResponse{
			Data: []api.Secret{
				{
					ID:    1,
					Name:  "SECRET_1",
					Value: "encrypted_value_1",
				},
				{
					ID:    2,
					Name:  "SECRET_2",
					Value: "encrypted_value_2",
				},
			},
		}
		// if err := client.GetSecrets(ctx, cfg.ProjectID, cfg.EnvironmentID, &secrets); err != nil {
		// 	fmt.Printf("Error getting secrets: %v\n", err)
		// 	return
		// }

		decryptedSecrets := make(map[string]string)
		for _, secret := range secrets.Data {
			if !exportConfig.shouldIncludeSecret(secret) {
				continue
			}

			decryptedValue, err := encryption.DecryptSecretValue(secret.Value, projectKeyBytes[:])
			if err != nil {
				fmt.Printf("Error decrypting secret %s: %v\n", secret.Name, err)
				continue
			}
			decryptedSecrets[secret.Name] = decryptedValue
		}

		if err := exportSecrets(exportConfig, decryptedSecrets); err != nil {
			fmt.Printf("Error exporting secrets: %v\n", err)
			os.Exit(1)
		}
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
