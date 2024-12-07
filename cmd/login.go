package cmd

import (
	"fmt"

	"github.com/Enkryptify/cli/ui/textInput"
	"github.com/Enkryptify/cli/utils/keys"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(loginCmd)
}

var loginCmd = &cobra.Command{
	Use:   "login [key]",
	Short: "Login to Enkryptify",
	Long:  "Login to Enkryptify using a personal API key or a project API key for server environments",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		var key string
		if len(args) == 1 {
			key = args[0]
		} else {
			var personalKey textInput.Output
			tprogram := tea.NewProgram(textInput.InitialModel(&personalKey, "Enter your personal API key", "ek_..."))
			if _, err := tprogram.Run(); err != nil {
				fmt.Println("Error:", err)
				return
			}

			key = personalKey.Output
		}

		if len(key) == 0 {
			fmt.Println("No API key provided")
			return
		}

		saveAPIKey(key)
	},
}

func saveAPIKey(key string) {
	// if !keys.APIKeyIsValid(key) {
	// 	fmt.Println("Invalid API key")
	// 	return
	// }

	// client := api.NewClient(key)
	// ctx := context.Background()

	// if err := client.ValidateAPIKey(ctx); err != nil {
	// 	fmt.Printf("Invalid API key: %v\n", err)
	// 	return
	// }

	if err := keys.SaveAPIKey(key); err != nil {
		fmt.Printf("Failed to save API key: %v\n", err)
		return
	}

	fmt.Println("API key saved")
}
