package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

const version = "0.1.0-alpha.1"

var rootCmd = &cobra.Command{
	Use:   "enkryptify",
	Short: "Enkryptify CLI",
	Long: `
   _____       _                     _   _  __       
  | ____|_ __ | | ___ __ _   _ _ __ | |_(_)/ _|_   _ 
  |  _| | '_ \| |/ / '__| | | | '_ \| __| | |_| | | |
  | |___| | | |   <| |  | |_| | |_) | |_| |  _| |_| |
  |_____|_| |_|_|\_\_|   \__, | .__/ \__|_|_|  \__, |
                         |___/|_|               |___/ 
			`,
	Version: version,
}

func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.Flags().BoolP("version", "v", false, "Get the current version of the CLI")
	rootCmd.SetVersionTemplate(`{{.Version}}
`)
}
