package cmd

import (
	"fmt"

	"github.com/Enkryptify/cli/utils/keys"
	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(logoutCmd)
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Logout from Enkryptify",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if err := keys.DeleteAPIKey(); err != nil {
			fmt.Printf("Failed to delete API key: %v\n", err)
			return
		}

		fmt.Println("Logged out from Enkryptify")
	},
}
