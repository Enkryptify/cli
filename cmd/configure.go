package cmd

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/Enkryptify/cli/api"
	"github.com/Enkryptify/cli/ui/selectInput"
	"github.com/Enkryptify/cli/ui/textInput"
	"github.com/Enkryptify/cli/utils/config"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

func init() {
	configureCmd.Flags().StringP("token", "t", "", "Project token (or set ENKRYPTIFY_TOKEN environment variable)")
	configureCmd.Flags().Bool("skip-token", false, "Keep the same token, useful for changing environments")
	configureCmd.Flags().Int64P("environment", "e", 0, "Environment ID")
	rootCmd.AddCommand(configureCmd)
}

var configureCmd = &cobra.Command{
	Use:   "configure",
	Short: "Configure your project",
	Example: `  enkryptify configure --token=ek_...
  enkryptify configure --skip-token --environment=123`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("error getting current directory: %v", err)
		}

		cm, err := config.NewConfigManager()
		if err != nil {
			return fmt.Errorf("error creating config manager: %v", err)
		}

		token := ""
		skipToken, _ := cmd.Flags().GetBool("skip-token")
		if skipToken {
			_, token, _, err = cm.GetConfig(cwd)
			if err != nil {
				return fmt.Errorf("error getting config: %v", err)
			}
		}

		// Part I: Access Token
		if token == "" {
			token, _ = cmd.Flags().GetString("token")

			// If token not provided via flag, check environment variable
			if token == "" {
				token = os.Getenv("ENKRYPTIFY_TOKEN")
			}

			if token == "" {
				var accessToken textInput.Output
				tprogram := tea.NewProgram(textInput.InitialModel(&accessToken, "Enter your project token", "ek_..."))
				if _, err := tprogram.Run(); err != nil {
					return err
				}

				token = accessToken.Output
			}
		}

		if len(token) == 0 {
			return fmt.Errorf("no project token provided")
		} else if !APIKeyIsValid(token) {
			return fmt.Errorf("invalid project token")
		}

		client := api.NewClient(token)
		ctx := context.Background()

		var tokenResponse api.TokenResponse
		if err := client.GetToken(ctx, &tokenResponse); err != nil {
			return fmt.Errorf("invalid project token: %v", err)
		}

		// Part II: Environment
		environmentIDFlag, _ := cmd.Flags().GetInt64("environment")
		environmentID := tokenResponse.Data.EnvironmentID

		if environmentID == 0 && environmentIDFlag != 0 {
			environmentID = environmentIDFlag
		} else if environmentID != 0 && environmentIDFlag != 0 && environmentIDFlag != environmentID {
			return fmt.Errorf("this token is unauthorized for this environment")
		}

		if environmentID == 0 && environmentIDFlag == 0 {
			var environments api.EnvironmentResponse
			if err := client.GetEnvironments(ctx, tokenResponse.Data.ProjectID, &environments); err != nil {
				return fmt.Errorf("invalid project token: %v", err)
			}

			environmentOptions := make([]selectInput.Item, len(environments.Data))
			for i, environment := range environments.Data {
				environmentOptions[i] = selectInput.Item{Title: environment.Name, ID: strconv.FormatInt(environment.ID, 10)}
			}

			var environmentSelection selectInput.Selection
			environmentModel := selectInput.InitialModel(environmentOptions, &environmentSelection, "Select an environment")
			if _, err := tea.NewProgram(environmentModel).Run(); err != nil {
				return fmt.Errorf("error selecting environment: %v", err)
			}

			envID, err := strconv.ParseInt(environmentSelection.Choice, 10, 64)
			if err != nil {
				return fmt.Errorf("error selecting environment: %v", err)
			}

			environmentID = envID
		}

		if environmentID == 0 {
			return fmt.Errorf("no environment selected")
		}

		config := config.Config{
			ProjectID:     tokenResponse.Data.ProjectID,
			EnvironmentID: environmentID,
			PublicKey:     tokenResponse.Data.PublicKey,
			DirectoryPath: cwd,
		}

		if err := cm.SetConfig(config, token, tokenResponse.Data.Key); err != nil {
			return fmt.Errorf("error adding config: %v", err)
		}

		fmt.Println("Configuration saved successfully")
		return nil
	},
}

func APIKeyIsValid(apiKey string) bool {
	parts := strings.Split(apiKey, "_")
	if len(parts) != 2 {
		return false
	} else if parts[0] != "ek" {
		return false
	} else if len(parts[1]) != 32 {
		return false
	}

	key := parts[1][:len(parts[1])-6]
	hash := parts[1][len(parts[1])-6:]

	hash_bytes := sha256.Sum256([]byte(key))
	hash_str := hex.EncodeToString(hash_bytes[:])
	return hash == hash_str[:6]
}
