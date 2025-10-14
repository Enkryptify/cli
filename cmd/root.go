package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var version = "0.1.9"

var rootCmd = &cobra.Command{
	Use:   "ek",
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
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.Flags().BoolP("version", "v", false, "Get the current version of the CLI")
	rootCmd.SetVersionTemplate("{{.Version}}\n")
}
