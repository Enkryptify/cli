package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Enkryptify/cli/internal/config"
	"github.com/Enkryptify/cli/internal/inject"
	"github.com/Enkryptify/cli/internal/ui"
)

var runCmd = &cobra.Command{
	Use:   "run -- <command>",
	Short: "Run a command with secrets injected as environment variables",
	Long: `Run a command with secrets from Enkryptify injected as environment variables.

This command fetches secrets from your configured Enkryptify workspace, project, and environment,
then runs the specified command with those secrets available as environment variables.

You must first run 'ek setup' to link your current directory to an Enkryptify configuration.

Examples:
  ek run -- npm start                    # Run npm start with secrets
  ek run -- pnpm run dev                 # Run pnpm dev with secrets  
  ek run -- python app.py               # Run Python app with secrets
  ek run -- docker-compose up           # Run docker-compose with secrets

Note: Use '--' to separate the ek command from the command you want to run.`,
	
	RunE: runRunCommand,
	// Allow arbitrary arguments after --
	DisableFlagParsing: false,
}

func init() {
	rootCmd.AddCommand(runCmd)
}

func runRunCommand(cmd *cobra.Command, args []string) error {
	// Validate authentication
	if err := ValidateAuthentication(); err != nil {
		ui.PrintError("You must be authenticated to run commands with secrets")
		ui.PrintInfo("Please run 'ek login' first")
		return err
	}

	// Get current directory setup
	currentPath, err := config.GetCurrentWorkingDirectory()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %w", err)
	}

	setupStorage, err := config.LoadSetupStorage()
	if err != nil {
		return fmt.Errorf("failed to load setup configuration: %w", err)
	}

	if !setupStorage.HasSetupForPath(currentPath) {
		ui.PrintError("No setup found for current directory")
		ui.PrintInfo("Please run 'ek setup' first to link this directory to an Enkryptify configuration")
		return fmt.Errorf("directory not configured")
	}

	setupConfig := setupStorage.GetSetupForPath(currentPath)
	if setupConfig == nil {
		return fmt.Errorf("failed to get setup configuration for current path")
	}

	// Parse arguments - look for -- separator
	var commandArgs []string
	
	// Find -- separator
	separatorIndex := -1
	for i, arg := range args {
		if arg == "--" {
			separatorIndex = i
			break
		}
	}

	if separatorIndex == -1 {
		// No -- separator found, treat all args as the command
		if len(args) == 0 {
			ui.PrintError("No command provided")
			ui.PrintInfo("Usage: ek run -- <command>")
			ui.PrintInfo("Example: ek run -- npm start")
			return fmt.Errorf("no command provided")
		}
		commandArgs = args
	} else {
		// Use args after --
		if separatorIndex+1 >= len(args) {
			ui.PrintError("No command provided after '--'")
			ui.PrintInfo("Usage: ek run -- <command>")
			ui.PrintInfo("Example: ek run -- npm start")
			return fmt.Errorf("no command provided after '--'")
		}
		commandArgs = args[separatorIndex+1:]
	}

	// Show info about what we're doing
	ui.PrintInfo(fmt.Sprintf("Running command with secrets from workspace: %s, project: %s", 
		setupConfig.WorkspaceSlug, setupConfig.ProjectSlug))
	ui.PrintInfo(fmt.Sprintf("Command: %s", strings.Join(commandArgs, " ")))

	// Inject secrets and run command
	if err := inject.InjectSecretsAndRun(
		setupConfig.WorkspaceSlug,
		setupConfig.ProjectSlug,
		setupConfig.EnvironmentID,
		commandArgs,
	); err != nil {
		return fmt.Errorf("failed to run command with secrets: %w", err)
	}

	return nil
}
