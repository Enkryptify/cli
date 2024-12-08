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
	Run: func(cmd *cobra.Command, args []string) {
		cwd, err := os.Getwd()
		if err != nil {
			fmt.Printf("Error getting current directory: %v\n", err)
			return
		}

		cm, err := config.NewConfigManager()
		if err != nil {
			fmt.Printf("Error creating config manager: %v\n", err)
			return
		}

		token := ""
		skipToken, _ := cmd.Flags().GetBool("skip-token")
		if skipToken {
			_, token, _, err = cm.GetConfig(cwd)
			if err != nil {
				fmt.Printf("Error getting config: %v\n", err)
				return
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
					fmt.Println("Error:", err)
					return
				}

				token = accessToken.Output
			}
		}

		if len(token) == 0 {
			fmt.Println("No project token provided")
			return
		} else if !APIKeyIsValid(token) {
			fmt.Println("Invalid project token")
			return
		}

		client := api.NewClient(token)
		ctx := context.Background()

		var tokenResponse api.TokenResponse
		if err := client.GetToken(ctx, &tokenResponse); err != nil {
			fmt.Printf("Invalid project token: %v\n", err)
			return
		}

		// Part II: Environment
		environmentIDFlag, _ := cmd.Flags().GetInt64("environment")
		environmentID := tokenResponse.Data.EnvironmentID

		if environmentID == 0 && environmentIDFlag != 0 {
			environmentID = environmentIDFlag
		} else if environmentID != 0 && environmentIDFlag != 0 && environmentIDFlag != environmentID {
			fmt.Println("This token is unauthorized for this environment")
			return
		}

		if environmentID == 0 && environmentIDFlag == 0 {
			var environments api.EnvironmentResponse
			if err := client.GetEnvironments(ctx, tokenResponse.Data.ProjectID, &environments); err != nil {
				fmt.Printf("Invalid project token: %v\n", err)
				return
			}

			environmentOptions := make([]selectInput.Item, len(environments.Data))
			for i, environment := range environments.Data {
				environmentOptions[i] = selectInput.Item{Title: environment.Name, ID: strconv.FormatInt(environment.ID, 10)}
			}

			var environmentSelection selectInput.Selection
			environmentModel := selectInput.InitialModel(environmentOptions, &environmentSelection, "Select an environment")
			if _, err := tea.NewProgram(environmentModel).Run(); err != nil {
				fmt.Printf("Error selecting environment: %v\n", err)
				return
			}

			envID, err := strconv.ParseInt(environmentSelection.Choice, 10, 64)
			if err != nil {
				fmt.Printf("Error selecting environment: %v\n", err)
				return
			}

			environmentID = envID
		}

		if environmentID == 0 {
			fmt.Println("No environment selected")
			return
		}

		config := config.Config{
			ProjectID:     tokenResponse.Data.ProjectID,
			EnvironmentID: environmentID,
			PublicKey:     tokenResponse.Data.PublicKey,
			DirectoryPath: cwd,
		}

		if err := cm.SetConfig(config, token, tokenResponse.Data.Key); err != nil {
			fmt.Printf("Error adding config: %v\n", err)
			return
		}

		fmt.Println("Configuration saved successfully")
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
