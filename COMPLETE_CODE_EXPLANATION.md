# Complete Code Explanation - Enkryptify CLI

This document explains every file in the Enkryptify CLI, line by line, assuming you're new to Go and this codebase.

---

## Table of Contents

1. [Command Layer (cmd/)](#command-layer-cmd)

   - [root.go](#rootgo)
   - [login.go](#logingo)
   - [setup.go](#setupgo)
   - [run.go](#rungo)

2. [Implementation Layer (internal/)](#implementation-layer-internal)

   - [auth/enkryptify.go](#authenkryptifygo)
   - [config/config.go](#configconfiggo)
   - [config/setup.go](#configsetupgo)
   - [inject/env.go](#injectenvgo)

3. [How Everything Works Together](#how-everything-works-together)

---

# Command Layer (cmd/)

The `cmd/` directory contains command handlers. These files handle user input, show UI messages, and coordinate the flow. They call functions from the `internal/` directory to do the actual work.

---

## root.go

**File**: `cmd/root.go`  
**Purpose**: Defines the root command and entry point for the CLI

### Line-by-Line Explanation

```go
package cmd
```

- Declares this file belongs to the `cmd` package

```go
import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)
```

- Imports:
  - `fmt`: For formatted printing
  - `os`: For operating system functions (like exiting)
  - `cobra`: CLI framework for building command-line applications

```go
var version = "0.1.10"
```

- Defines the CLI version as a string variable

```go
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
```

- Creates the root command:
  - `Use: "ek"`: The command name users type
  - `Short`: Brief description shown in help
  - `Long`: ASCII art logo shown in help
  - `Version`: Version number

```go
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
```

- Entry point function:
  - Executes the root command
  - If error occurs, prints to stderr and exits with code 1

```go
func init() {
	rootCmd.Flags().BoolP("version", "v", false, "Get the current version of the CLI")
	rootCmd.SetVersionTemplate("{{.Version}}\n")
}
```

- Initialization function (runs automatically):
  - Adds `--version` / `-v` flag
  - Sets template for version output

**Summary**: This file creates the root `ek` command and sets up version flag. It's the entry point that all other commands attach to.

---

## login.go

**File**: `cmd/login.go`  
**Purpose**: Handles the `ek login` command - authenticates user with Enkryptify

### Line-by-Line Explanation

```go
package cmd
```

- Part of the `cmd` package

```go
import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/Enkryptify/cli/internal/auth"
	"github.com/Enkryptify/cli/internal/config"
	"github.com/Enkryptify/cli/internal/ui"
)
```

- Imports:
  - Standard library: context, fmt, os, signal, syscall, time
  - Cobra: CLI framework
  - Internal packages: auth, config, ui

```go
var (
	loginForce bool
	loginHelp  bool
)
```

- Global variables for command flags:
  - `loginForce`: `--force` flag (force re-authentication)
  - `loginHelp`: `--help` flag

```go
var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with Enkryptify",
	Long: `Authenticate with Enkryptify to access your secrets.
...`,
	RunE: runLogin,
}
```

- Defines the `login` command:
  - `Use`: Command name
  - `Short`: Brief description
  - `Long`: Detailed help text
  - `RunE`: Function to execute when command runs

```go
func init() {
	loginCmd.Flags().BoolVarP(&loginForce, "force", "f", false, "Force re-authentication even if already logged in")
	loginCmd.Flags().BoolVarP(&loginHelp, "help", "h", false, "Show help for login command")

	rootCmd.AddCommand(loginCmd)
}
```

- Initialization:
  - Adds `--force` / `-f` flag
  - Adds `--help` / `-h` flag
  - Registers `loginCmd` as a subcommand of `rootCmd`

```go
func runLogin(cmd *cobra.Command, args []string) error {
```

- Main login function:
  - `cmd`: The command object
  - `args`: Command arguments
  - Returns error if something goes wrong

```go
	// Show help if requested
	if loginHelp {
		return cmd.Help()
	}
```

- If `--help` flag is set, show help and exit

```go
	// Show brand header
	ui.ShowBrandHeader()
```

- Displays ASCII art logo

```go
	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
```

- Creates a context that can be cancelled:
  - `ctx`: Context for cancellation
  - `cancel`: Function to cancel the context
  - `defer cancel()`: Ensures cancellation when function exits

```go
	// Handle interrupt signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
```

- Sets up signal handling:
  - Creates channel for signals
  - Listens for Ctrl+C (Interrupt) and SIGTERM

```go
	go func() {
		<-sigChan
		ui.PrintWarning("Login cancelled by user")
		cancel()
	}()
```

- Goroutine (concurrent function):
  - Waits for signal
  - Shows warning message
  - Cancels context (stops login process)

```go
	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		ui.ShowAuthError(fmt.Errorf("failed to load configuration: %w", err))
		return err
	}
```

- Loads main config file (`~/.config/enkryptify/config.json`):
  - If error, shows error and exits

```go
	// Initialize Enkryptify auth
	enkryptifyAuth := auth.NewEnkryptifyAuth()
```

- Creates authentication handler:
  - This object handles OAuth flow

```go
	// Check if already authenticated (unless force flag is used)
	if !loginForce {
```

- Only check if `--force` flag is NOT set

```go
		authenticated, err := enkryptifyAuth.IsAuthenticated()
		if err != nil {
			ui.PrintWarning(fmt.Sprintf("Failed to check authentication status: %v", err))
		} else if authenticated {
```

- Checks if user is already logged in:
  - Checks keyring for stored token
  - If error, shows warning
  - If authenticated, continue to verification

```go
			// Try to get user info to verify the token is still valid
			accessToken, err := enkryptifyAuth.GetAccessToken()
			if err == nil {
				userInfo, err := enkryptifyAuth.GetUserInfo(accessToken)
				if err == nil {
```

- Verifies token is still valid:
  - Gets token from keyring
  - Makes API call to get user info
  - If both succeed, token is valid

```go
					ui.ShowAuthSuccess(userInfo.Email)
					ui.PrintInfo("You are already authenticated. Use --force to re-authenticate.")
					return nil
				}
			}
```

- If token is valid:
  - Shows success with user email
  - Shows message
  - **EXITS HERE** (no login needed!)

```go
			// If we can't verify the token, continue with login
			ui.PrintWarning("Existing authentication appears to be invalid. Proceeding with login...")
		}
	}
```

- If token is invalid/expired:
  - Shows warning
  - Continues to login flow

```go
	// Show current provider info
	ui.ShowProviderInfo("Enkryptify", false)
```

- Shows which provider we're authenticating with

```go
	// Start authentication process
	ui.PrintInfo("Starting authentication with Enkryptify...")
```

- Shows info message

```go
	// Create a timeout context for the entire login process
	loginCtx, loginCancel := context.WithTimeout(ctx, 10*time.Minute)
	defer loginCancel()
```

- Creates timeout context:
  - 10 minute timeout
  - If login takes longer, it times out

```go
	// Perform login
	if err := enkryptifyAuth.Login(loginCtx); err != nil {
```

- **Calls internal auth function** to do OAuth flow:
  - This is where the actual login happens
  - Delegates to `internal/auth/enkryptify.go`

```go
		if loginCtx.Err() == context.Canceled {
			ui.PrintWarning("Login cancelled")
			return nil
		}
		if loginCtx.Err() == context.DeadlineExceeded {
			ui.ShowAuthError(fmt.Errorf("login timeout - please try again"))
			return fmt.Errorf("login timeout")
		}

		ui.ShowAuthError(err)
		return err
	}
```

- Error handling:
  - If cancelled (Ctrl+C), show warning
  - If timeout, show error
  - Otherwise, show error and exit

```go
	// Update configuration with successful login
	cfg.SetProvider("enkryptify", config.Provider{
		Type: "enkryptify",
		Settings: map[string]interface{}{
			"authenticated": true,
			"last_login":    time.Now().Unix(),
		},
	})
```

- After successful login:
  - Updates config to mark provider as authenticated
  - Sets last login timestamp

```go
	if err := cfg.Save(); err != nil {
		ui.PrintWarning("Authentication successful, but failed to save configuration.")
	}
```

- Saves config to file:
  - If save fails, shows warning (but login was successful)

```go
	return nil
}
```

- Returns success

```go
// ValidateAuthentication checks if the user is authenticated with any provider
func ValidateAuthentication() error {
```

- Helper function used by other commands:
  - Checks if user is logged in

```go
	enkryptifyAuth := auth.NewEnkryptifyAuth()

	authenticated, err := enkryptifyAuth.IsAuthenticated()
	if err != nil {
		return fmt.Errorf("failed to check authentication status: %w", err)
	}

	if !authenticated {
		return fmt.Errorf("not authenticated - please run 'ek login' first")
	}
```

- Checks authentication:
  - Creates auth handler
  - Checks if authenticated
  - If not, returns error

```go
	// Verify token is still valid
	_, err = enkryptifyAuth.GetAccessToken()
	if err != nil {
		return fmt.Errorf("authentication token is invalid - please run 'ek login' again")
	}

	return nil
}
```

- Verifies token exists and is valid:
  - Gets token from keyring
  - If error, token is invalid

```go
// GetCurrentUser returns information about the currently authenticated user
func GetCurrentUser() (string, error) {
	enkryptifyAuth := auth.NewEnkryptifyAuth()

	accessToken, err := enkryptifyAuth.GetAccessToken()
	if err != nil {
		return "", fmt.Errorf("failed to get access token: %w", err)
	}

	userInfo, err := enkryptifyAuth.GetUserInfo(accessToken)
	if err != nil {
		return "", fmt.Errorf("failed to get user info: %w", err)
	}

	return userInfo.Email, nil
}
```

- Gets current user's email:
  - Gets token
  - Makes API call to get user info
  - Returns email

```go
// Logout removes stored authentication information
func Logout() error {
	enkryptifyAuth := auth.NewEnkryptifyAuth()
	return enkryptifyAuth.Logout()
}
```

- Logs out user:
  - Creates auth handler
  - Calls logout function (deletes token from keyring)

**Summary**: This file handles the `ek login` command. It checks if user is already logged in, shows UI, handles cancellation, and calls the internal auth function to do the OAuth flow. After successful login, it updates the config file.

---

## setup.go

**File**: `cmd/setup.go`  
**Purpose**: Handles the `ek setup` command - links current directory to Enkryptify workspace/project/environment

### Line-by-Line Explanation

```go
package cmd
```

- Part of the `cmd` package

```go
import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/Enkryptify/cli/internal/auth"
	"github.com/Enkryptify/cli/internal/config"
	"github.com/Enkryptify/cli/internal/providers/enkryptify"
	"github.com/Enkryptify/cli/internal/ui"
)
```

- Imports:
  - Standard library: fmt, os
  - Cobra: CLI framework
  - Internal packages: auth, config, enkryptify provider, ui

```go
var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Link current directory to an Enkryptify repository",
	Long: `Link the current git repository to an Enkryptify workspace, project, and environment.
...`,
	RunE: runSetup,
}
```

- Defines the `setup` command:
  - Links directory to Enkryptify config
  - Runs `runSetup` function

```go
func init() {
	rootCmd.AddCommand(setupCmd)
}
```

- Registers `setupCmd` as subcommand of `rootCmd`

```go
func runSetup(cmd *cobra.Command, args []string) error {
```

- Main setup function

```go
	if err := ValidateAuthentication(); err != nil {
		ui.PrintError("You must be authenticated to run setup")
		ui.PrintInfo("Please run 'ek login' first")
		return err
	}
```

- Validates user is logged in:
  - Uses helper function from `login.go`
  - If not authenticated, shows error and exits

```go
	currentPath, err := config.GetCurrentWorkingDirectory()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %w", err)
	}
```

- Gets current working directory:
  - Example: `/Users/ali/my-project`
  - Used to link directory to config

```go
	setupStorage, err := config.LoadSetupStorage()
	if err != nil {
		return fmt.Errorf("failed to load setup configuration: %w", err)
	}
```

- Loads setup storage:
  - Reads `~/.enkryptify/config.json`
  - Contains directory → workspace/project/environment mappings

```go
	client := enkryptify.NewClient()
```

- Creates Enkryptify API client:
  - Used to fetch workspaces/projects/environments

```go
	// Check if using environment variable token (for server environments)
	if token := os.Getenv(auth.EnvTokenKey); token != "" {
		return runNonInteractiveSetup(currentPath, setupStorage, client)
	}
```

- Checks for environment token:
  - If `ENKRYPTIFY_TOKEN` is set, use non-interactive setup
  - Used in CI/CD servers

```go
	// Interactive setup for user authentication
	return runInteractiveSetup(currentPath, setupStorage, client)
}
```

- Otherwise, use interactive setup:
  - User selects workspace/project/environment

```go
// runNonInteractiveSetup handles setup for server environments using env token
func runNonInteractiveSetup(currentPath string, setupStorage *config.SetupStorage, client *enkryptify.Client) error {
```

- Non-interactive setup function:
  - Used when `ENKRYPTIFY_TOKEN` is set
  - No user interaction needed

```go
	// Fetch project details from the token
	tokenDetails, err := client.GetProjectTokenDetails()
	if err != nil {
		return fmt.Errorf("failed to fetch project token details: %w", err)
	}
```

- Gets project info from token:
  - Token contains workspace/project/environment info
  - Makes API call

```go
	// Check if setup already exists
	if setupStorage.HasSetupForPath(currentPath) {
		existingSetup := setupStorage.GetSetupForPath(currentPath)
		// In non-interactive mode, we just overwrite silently
		fmt.Printf("Updating existing setup for %s\n", currentPath)
		fmt.Printf("Previous: workspace=%s, project=%s, environment=%s\n",
			existingSetup.WorkspaceSlug, existingSetup.ProjectSlug, existingSetup.EnvironmentID)
	}
```

- Checks if setup exists:
  - If yes, shows previous config
  - Will overwrite it

```go
	// Create setup config from token details
	setupConfig := config.SetupConfig{
		Path:          currentPath,
		WorkspaceSlug: tokenDetails.Workspace.Slug,
		ProjectSlug:   tokenDetails.Project.Slug,
		EnvironmentID: tokenDetails.EnvironmentID,
	}
```

- Creates setup config:
  - Links directory to workspace/project/environment

```go
	setupStorage.AddOrUpdateSetup(setupConfig)
	if err := setupStorage.Save(); err != nil {
		return fmt.Errorf("failed to save setup configuration: %w", err)
	}
```

- Saves setup:
  - Adds/updates in memory
  - Saves to file

```go
	fmt.Printf("✓ Setup completed successfully!\n")
	fmt.Printf("  Workspace: %s\n", tokenDetails.Workspace.Slug)
	fmt.Printf("  Project: %s\n", tokenDetails.Project.Slug)
	fmt.Printf("  Environment: %s\n", tokenDetails.EnvironmentID)
	fmt.Printf("  Path: %s\n", currentPath)
```

- Shows success message with details

```go
	return nil
}
```

- Returns success

```go
// runInteractiveSetup handles setup with interactive prompts for user authentication
func runInteractiveSetup(currentPath string, setupStorage *config.SetupStorage, client *enkryptify.Client) error {
```

- Interactive setup function:
  - User selects workspace/project/environment

```go
	ui.ShowBrandHeader()
	ui.PrintTitle("🔗 Enkryptify Repository Setup")
```

- Shows UI header

```go
	if setupStorage.HasSetupForPath(currentPath) {
		existingSetup := setupStorage.GetSetupForPath(currentPath)
		ui.PrintWarning("Setup already exists for this directory")
		ui.PrintInfo(fmt.Sprintf("Current setup: workspace=%s, project=%s, environment=%s",
			existingSetup.WorkspaceSlug, existingSetup.ProjectSlug, existingSetup.EnvironmentID))

		if !ui.ConfirmAction("Do you want to overwrite the existing setup?") {
			ui.PrintInfo("Setup cancelled")
			return nil
		}
	}
```

- Checks if setup exists:
  - If yes, shows current config
  - Asks user to confirm overwrite
  - If no, cancels

```go
	ui.ShowProgress(1, 3, "Fetching workspaces...")
	workspaces, err := client.GetWorkspaces()
	if err != nil {
		return fmt.Errorf("failed to fetch workspaces: %w", err)
	}
```

- Step 1: Fetch workspaces:
  - Shows progress (1 of 3)
  - Makes API call to get workspaces

```go
	if len(workspaces) == 0 {
		ui.PrintError("No workspaces found")
		ui.PrintInfo("Please create a workspace in Enkryptify first")
		return fmt.Errorf("no workspaces available")
	}
```

- Validates workspaces exist:
  - If none, shows error and exits

```go
	workspaceItems := make([]ui.SelectionItem, len(workspaces))
	for i, ws := range workspaces {
		workspaceItems[i] = ui.SelectionItem{
			ID:          ws.ID,
			Name:        ws.Name,
			Slug:        ws.Slug,
		}
	}
```

- Converts workspaces to selection items:
  - Creates list for UI selection

```go
	selectedWorkspace, err := ui.SelectFromList(workspaceItems, "workspace")
	if err != nil {
		return err
	}
```

- User selects workspace:
  - Shows list, user picks one

```go
	ui.ShowProgress(2, 3, "Fetching projects...")
	projects, err := client.GetProjects(selectedWorkspace.Slug)
	if err != nil {
		return fmt.Errorf("failed to fetch projects: %w", err)
	}
```

- Step 2: Fetch projects:
  - Shows progress (2 of 3)
  - Gets projects for selected workspace

```go
	if len(projects) == 0 {
		ui.PrintError("No projects found in the selected workspace")
		ui.PrintInfo("Please create a project in this workspace first")
		return fmt.Errorf("no projects available")
	}
```

- Validates projects exist

```go
	projectItems := make([]ui.SelectionItem, len(projects))
	for i, proj := range projects {
		projectItems[i] = ui.SelectionItem{
			ID:          proj.ID,
			Name:        proj.Name,
			Slug:        proj.Slug,
		}
	}

	selectedProject, err := ui.SelectFromList(projectItems, "project")
	if err != nil {
		return err
	}
```

- User selects project:
  - Converts to selection items
  - User picks one

```go
	ui.ShowProgress(3, 3, "Fetching environments...")
	projectDetail, err := client.GetProjectDetail(selectedWorkspace.Slug, selectedProject.Slug)
	if err != nil {
		return fmt.Errorf("failed to get project detail: %w", err)
	}
```

- Step 3: Fetch environments:
  - Shows progress (3 of 3)
  - Gets project detail (includes environments)

```go
	if len(projectDetail.Environments) == 0 {
		ui.PrintError("No environments found in the selected project")
		ui.PrintInfo("Please create an environment in this project first")
		return fmt.Errorf("no environments available")
	}
```

- Validates environments exist

```go
	environmentItems := make([]ui.SelectionItem, len(projectDetail.Environments))
	for i, env := range projectDetail.Environments {
		environmentItems[i] = ui.SelectionItem{
			ID:          env.ID,
			Name:        env.Name,
		}
	}

	selectedEnvironment, err := ui.SelectFromList(environmentItems, "environment")
	if err != nil {
		return err
	}
```

- User selects environment:
  - Converts to selection items
  - User picks one

```go
	setupConfig := config.SetupConfig{
		Path:          currentPath,
		WorkspaceSlug: selectedWorkspace.Slug,
		ProjectSlug:   selectedProject.Slug,
		EnvironmentID: selectedEnvironment.ID,
	}
```

- Creates setup config:
  - Links directory to selected workspace/project/environment

```go
	setupStorage.AddOrUpdateSetup(setupConfig)
	if err := setupStorage.Save(); err != nil {
		return fmt.Errorf("failed to save setup configuration: %w", err)
	}
```

- Saves setup:
  - Adds/updates in memory
  - Saves to `~/.enkryptify/config.json`

```go
	ui.PrintSeparator()
	ui.PrintSuccess("Setup completed successfully!")
	ui.PrintInfo(fmt.Sprintf("Workspace: %s (%s)", selectedWorkspace.Name, selectedWorkspace.Slug))
	ui.PrintInfo(fmt.Sprintf("Project: %s (%s)", selectedProject.Name, selectedProject.Slug))
	ui.PrintInfo(fmt.Sprintf("Environment: %s", selectedEnvironment.Name))
	ui.PrintInfo(fmt.Sprintf("Path: %s", currentPath))
```

- Shows success message with details

```go
	return nil
}
```

- Returns success

**Summary**: This file handles the `ek setup` command. It validates authentication, fetches workspaces/projects/environments from API, lets user select them, and saves the mapping to `~/.enkryptify/config.json`. It does NOT fetch secrets - it only saves which workspace/project/environment to use.

---

## run.go

**File**: `cmd/run.go`  
**Purpose**: Handles the `ek run` command - runs a command with secrets injected as environment variables

### Line-by-Line Explanation

```go
package cmd
```

- Part of the `cmd` package

```go
import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Enkryptify/cli/internal/config"
	"github.com/Enkryptify/cli/internal/inject"
	"github.com/Enkryptify/cli/internal/ui"
)
```

- Imports:
  - Standard library: fmt, strings
  - Cobra: CLI framework
  - Internal packages: config, inject, ui

```go
var runCmd = &cobra.Command{
	Use:   "run -- <command>",
	Short: "Run a command with secrets injected as environment variables",
	Long: `Run a command with secrets from Enkryptify injected as environment variables.
...`,
	RunE: runRunCommand,
	DisableFlagParsing: false,
}
```

- Defines the `run` command:
  - `Use`: Shows `--` separator in help
  - Runs `runRunCommand` function

```go
func init() {
	rootCmd.AddCommand(runCmd)
}
```

- Registers `runCmd` as subcommand

```go
func runRunCommand(cmd *cobra.Command, args []string) error {
```

- Main run function

```go
	// Validate authentication
	if err := ValidateAuthentication(); err != nil {
		ui.PrintError("You must be authenticated to run commands with secrets")
		ui.PrintInfo("Please run 'ek login' first")
		return err
	}
```

- Validates user is logged in:
  - Uses helper from `login.go`
  - If not authenticated, shows error and exits

```go
	// Get current directory setup
	currentPath, err := config.GetCurrentWorkingDirectory()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %w", err)
	}
```

- Gets current working directory:
  - Example: `/Users/ali/my-project`

```go
	setupStorage, err := config.LoadSetupStorage()
	if err != nil {
		return fmt.Errorf("failed to load setup configuration: %w", err)
	}
```

- Loads setup storage:
  - Reads `~/.enkryptify/config.json`

```go
	if !setupStorage.HasSetupForPath(currentPath) {
		ui.PrintError("No setup found for current directory")
		ui.PrintInfo("Please run 'ek setup' first to link this directory to an Enkryptify configuration")
		return fmt.Errorf("directory not configured")
	}
```

- Checks if directory has setup:
  - If not, shows error and exits
  - User must run `ek setup` first

```go
	setupConfig := setupStorage.GetSetupForPath(currentPath)
	if setupConfig == nil {
		return fmt.Errorf("failed to get setup configuration for current path")
	}
```

- Gets setup config for directory:
  - Returns workspace/project/environment IDs

```go
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
```

- Parses command arguments:
  - Looks for `--` separator
  - Everything after `--` is the command to run

```go
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
```

- Handles two cases:
  - No `--`: Treat all args as command
  - Has `--`: Use args after `--`
  - Validates command exists

```go
	// Show info about what we're doing
	ui.PrintInfo(fmt.Sprintf("Running command with secrets from workspace: %s, project: %s",
		setupConfig.WorkspaceSlug, setupConfig.ProjectSlug))
	ui.PrintInfo(fmt.Sprintf("Command: %s", strings.Join(commandArgs, " ")))
```

- Shows info:
  - Which workspace/project secrets come from
  - Command that will run

```go
	// Inject secrets and run command
	if err := inject.InjectSecretsAndRun(
		setupConfig.WorkspaceSlug,
		setupConfig.ProjectSlug,
		setupConfig.EnvironmentID,
		commandArgs,
	); err != nil {
		return fmt.Errorf("failed to run command with secrets: %w", err)
	}
```

- **Calls injection function**:
  - Passes workspace/project/environment IDs
  - Passes command to run
  - Delegates to `internal/inject/env.go`

```go
	return nil
}
```

- Returns success

**Summary**: This file handles the `ek run` command. It validates authentication, finds setup config for current directory, parses command arguments, and calls the injection function to fetch secrets and run the command.

---

# Implementation Layer (internal/)

The `internal/` directory contains the actual implementation. These files do the real work: API calls, file operations, secret fetching, etc.

---

## auth/enkryptify.go

**File**: `internal/auth/enkryptify.go`  
**Purpose**: Handles OAuth 2.0 authentication with Enkryptify using PKCE flow

### Line-by-Line Explanation

```go
package auth
```

- Part of the `auth` package

```go
import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/pkg/browser"

	"github.com/Enkryptify/cli/internal/config"
	"github.com/Enkryptify/cli/internal/keyring"
	"github.com/Enkryptify/cli/internal/ui"
)
```

- Imports:
  - Standard library: context, crypto, encoding, fmt, io, net/http, net/url, os, strings, time
  - External: browser (opens URLs)
  - Internal: config, keyring, ui

```go
const (
	ClientID           = "enkryptify-cli"
	AuthBaseURL        = "https://app.enkryptify.com"
	TokenEndpoint      = "https://api.enkryptify.com/v1/auth/token"
	UserInfoEndpoint   = "https://api.enkryptify.com/v1/me"
	RedirectURL        = "http://localhost:51823/callback"
	CallbackPort       = "51823"
	DefaultScopes      = "openid profile email secrets:read secrets:write"
	EnvTokenKey        = "ENKRYPTIFY_TOKEN"
)
```

- Constants:
  - `ClientID`: OAuth client identifier
  - `AuthBaseURL`: Enkryptify app URL
  - `TokenEndpoint`: API endpoint to exchange code for token
  - `UserInfoEndpoint`: API endpoint to get user info
  - `RedirectURL`: Local callback URL (OAuth redirects here)
  - `CallbackPort`: Port for local server
  - `DefaultScopes`: Permissions requested
  - `EnvTokenKey`: Environment variable name for token

```go
// EnkryptifyAuth handles authentication with Enkryptify
type EnkryptifyAuth struct {
	keyring    *keyring.Store
	config     *config.Config
	httpClient *http.Client
}
```

- Struct definition:
  - `keyring`: Stores tokens securely
  - `config`: CLI configuration
  - `httpClient`: HTTP client for API calls

```go
// NewEnkryptifyAuth creates a new Enkryptify authentication handler
func NewEnkryptifyAuth() *EnkryptifyAuth {
	return &EnkryptifyAuth{
		keyring:    keyring.NewStore(),
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}
```

- Constructor function:
  - Creates new auth handler
  - Initializes keyring
  - Creates HTTP client with 30s timeout

```go
// AuthResponse represents the response from the authentication server
type AuthResponse struct {
	AccessToken  string `json:"accessToken"`
	TokenType    string `json:"tokenType"`
	ExpiresIn    int64  `json:"expiresIn,omitempty"`
}
```

- Struct for token response:
  - `AccessToken`: Token to use for API calls
  - `TokenType`: Usually "Bearer"
  - `ExpiresIn`: Seconds until expiration

```go
// UserInfo represents user information from the API
type UserInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}
```

- Struct for user info:
  - `ID`: User ID
  - `Email`: User email
  - `Name`: User name (optional)

```go
// generateCodeVerifier generates a code verifier for PKCE
func generateCodeVerifier() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
```

- Generates PKCE code verifier:
  - Creates 32 random bytes
  - Encodes as base64 URL-safe string
  - Used in OAuth PKCE flow

```go
// generateCodeChallenge generates a code challenge from a code verifier
func generateCodeChallenge(verifier string) string {
	sha := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sha[:])
}
```

- Generates PKCE code challenge:
  - Hashes verifier with SHA256
  - Encodes as base64 URL-safe string
  - Sent to OAuth server (verifier kept secret)

```go
// Login performs the OAuth login flow with Enkryptify
func (e *EnkryptifyAuth) Login(ctx context.Context) error {
```

- Main login function:
  - `ctx`: Context for cancellation/timeout
  - Returns error if fails

```go
	// Check if using environment variable token
	if token := os.Getenv(EnvTokenKey); token != "" {
		ui.PrintInfo(fmt.Sprintf("Authenticated using %s environment variable", EnvTokenKey))
		return nil
	}
```

- Checks for environment token:
  - If `ENKRYPTIFY_TOKEN` is set, skip OAuth
  - Used in CI/CD servers

```go
	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}
	e.config = cfg
```

- Loads config:
  - Reads `~/.config/enkryptify/config.json`
  - Stores in struct

```go
	// Check if already authenticated
	authenticated, err := e.IsAuthenticated()
	if err != nil {
		return fmt.Errorf("failed to check authentication status: %w", err)
	}
```

- Checks if already logged in:
  - Checks keyring for token

```go
	if authenticated {
		authInfo, err := e.keyring.GetAuthInfo("enkryptify")
		if err != nil {
			return fmt.Errorf("failed to get auth info: %w", err)
		}

		userInfo, err := e.GetUserInfo(authInfo.AccessToken)
		if err == nil {
			ui.ShowAuthSuccess(userInfo.Email)
			return nil
		}
```

- If authenticated:
  - Gets token from keyring
  - Verifies token with API call
  - If valid, shows success and exits

```go
		// If we can't get user info (token expired/invalid), clear stored auth and proceed with login
		ui.PrintWarning("Stored authentication is invalid or expired. Starting fresh login...")
		e.keyring.DeleteAuthInfo("enkryptify")
	}
```

- If token invalid:
  - Shows warning
  - Deletes invalid token
  - Continues to OAuth flow

```go
	// Generate PKCE parameters
	codeVerifier, err := generateCodeVerifier()
	if err != nil {
		return fmt.Errorf("failed to generate code verifier: %w", err)
	}
	codeChallenge := generateCodeChallenge(codeVerifier)
```

- Generates PKCE parameters:
  - Code verifier (secret)
  - Code challenge (hash of verifier)

```go
	// Generate state parameter for security
	state, err := generateCodeVerifier()
	if err != nil {
		return fmt.Errorf("failed to generate state: %w", err)
	}
```

- Generates state parameter:
  - Random string for CSRF protection
  - Verifies callback is legitimate

```go
	// Start local callback server
	authResult := make(chan AuthResponse, 1)
	errorResult := make(chan error, 1)
```

- Creates channels:
  - `authResult`: Receives successful auth response
  - `errorResult`: Receives errors
  - Used for communication between goroutines

```go
	server := &http.Server{Addr: ":" + CallbackPort}
```

- Creates HTTP server:
  - Listens on port 51823
  - Waits for OAuth callback

```go
	http.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
```

- Registers callback handler:
  - Handles `/callback` endpoint
  - OAuth server redirects here

```go
		// Check for errors
		if errCode := r.URL.Query().Get("error"); errCode != "" {
			errDesc := r.URL.Query().Get("error_description")
			if errDesc == "" {
				errDesc = errCode
			}
```

- Checks for OAuth errors:
  - Reads error from URL query params
  - Gets error description

```go
			// Show error page
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, `
				<html>
					<head><title>Authentication Error</title></head>
					<body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
						<h2 style="color: #E64545;">Authentication Error</h2>
						<p style="color: #F7F7F7;">%s</p>
						<p style="color: #F7F7F7;">You can close this window and try again.</p>
					</body>
				</html>
			`, errDesc)
```

- Shows error page in browser:
  - HTML page with error message
  - User can close window

```go
			// Ensure response is sent before shutting down
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}

			// Delay shutdown to allow browser to receive response
			go func() {
				time.Sleep(1 * time.Second)
				server.Shutdown(context.Background())
			}()

			errorResult <- fmt.Errorf("authentication error: %s", errDesc)
			return
		}
```

- Handles error:
  - Flushes response to browser
  - Shuts down server after delay
  - Sends error to channel

```go
		// Verify state parameter
		receivedState := r.URL.Query().Get("state")
		if receivedState != state {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, "Invalid state parameter")

			// Ensure response is sent before shutting down
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}

			// Delay shutdown to allow browser to receive response
			go func() {
				time.Sleep(1 * time.Second)
				server.Shutdown(context.Background())
			}()

			errorResult <- fmt.Errorf("invalid state parameter")
			return
		}
```

- Verifies state parameter:
  - Prevents CSRF attacks
  - Compares received state with sent state
  - If mismatch, shows error and exits

```go
		// Get authorization code
		code := r.URL.Query().Get("code")
		if code == "" {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, "Missing authorization code")

			// Ensure response is sent before shutting down
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}

			// Delay shutdown to allow browser to receive response
			go func() {
				time.Sleep(1 * time.Second)
				server.Shutdown(context.Background())
			}()

			errorResult <- fmt.Errorf("missing authorization code")
			return
		}
```

- Gets authorization code:
  - OAuth server sends code in URL
  - If missing, shows error and exits

```go
		// Exchange code for token
		authResp, err := e.exchangeCodeForToken(code, codeVerifier)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintf(w, "Failed to exchange code for token")

			// Ensure response is sent before shutting down
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}

			// Delay shutdown to allow browser to receive response
			go func() {
				time.Sleep(1 * time.Second)
				server.Shutdown(context.Background())
			}()

			errorResult <- fmt.Errorf("failed to exchange code for token: %w", err)
			return
		}
```

- Exchanges code for token:
  - Calls `exchangeCodeForToken` function
  - If error, shows error page and exits

```go
		// Show success page
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `
			<html>
				<head><title>Authentication Successful</title></head>
				<body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
					<h2 style="color: #2AC769;">Authentication Successful!</h2>
					<p style="color: #F7F7F7;">You have successfully authenticated with Enkryptify.</p>
					<p style="color: #F7F7F7;">You can now close this window and return to your terminal.</p>
				</body>
			</html>
		`)
```

- Shows success page:
  - HTML page with success message
  - User can close window

```go
		// Ensure response is sent before shutting down
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

		// Delay shutdown to allow browser to receive response
		go func() {
			time.Sleep(1 * time.Second)
			server.Shutdown(context.Background())
		}()

		authResult <- *authResp
	})
```

- Handles success:
  - Flushes response
  - Shuts down server
  - Sends auth response to channel

```go
	// Start the server in a goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errorResult <- fmt.Errorf("failed to start callback server: %w", err)
		}
	}()
```

- Starts server:
  - Runs in goroutine (concurrent)
  - Listens for connections
  - If error, sends to error channel

```go
	// Wait for server to start
	time.Sleep(100 * time.Millisecond)
```

- Waits for server to start:
  - Small delay to ensure server is ready

```go
	// Build authorization URL
	authURL := fmt.Sprintf("%s/oauth/authorize?"+
		"client_id=%s&"+
		"response_type=code&"+
		"redirect_uri=%s&"+
		"scope=%s&"+
		"state=%s&"+
		"code_challenge=%s&"+
		"code_challenge_method=S256",
		AuthBaseURL,
		url.QueryEscape(ClientID),
		url.QueryEscape(RedirectURL),
		url.QueryEscape(DefaultScopes),
		url.QueryEscape(state),
		url.QueryEscape(codeChallenge),
	)
```

- Builds OAuth URL:
  - Includes client ID, redirect URI, scopes, state, code challenge
  - URL-encodes parameters

```go
	showAuthInstructions(authURL)

	if err := browser.OpenURL(authURL); err != nil {
		ui.PrintWarning("Failed to open browser automatically. Please open the URL manually.")
	}
```

- Opens browser:
  - Shows instructions
  - Opens URL automatically
  - If fails, shows manual instructions

```go
	ui.ShowWaitingForAuth()
```

- Shows waiting message

```go
	// Wait for authentication result
	select {
	case authResp := <-authResult:
```

- Waits for result:
  - Uses `select` to wait for channels
  - If auth succeeds, receives response

```go
		// Get user info
		userInfo, err := e.GetUserInfo(authResp.AccessToken)
		if err != nil {
			return fmt.Errorf("failed to get user info: %w", err)
		}
```

- Gets user info:
  - Makes API call with token
  - Gets user email/ID

```go
		// Store authentication info
		authInfo := &config.AuthInfo{
			AccessToken:  authResp.AccessToken,
			ExpiresAt:    time.Now().Unix() + authResp.ExpiresIn,
			UserID:       userInfo.ID,
			Email:        userInfo.Email,
		}
```

- Creates auth info:
  - Stores token, expiration, user ID, email

```go
		if err := e.keyring.StoreAuthInfo("enkryptify", authInfo); err != nil {
			return fmt.Errorf("failed to store auth info: %w", err)
		}
```

- Stores in keyring:
  - Saves securely to OS keyring
  - Key: "enkryptify"

```go
		// Update configuration
		e.config.SetProvider("enkryptify", config.Provider{
			Type: "enkryptify",
			Settings: map[string]interface{}{
				"authenticated": true,
				"last_login":    time.Now().Unix(),
			},
		})

		if err := e.config.Save(); err != nil {
			ui.PrintWarning("Failed to save configuration, but authentication was successful.")
		}
```

- Updates config:
  - Marks provider as authenticated
  - Sets last login timestamp
  - Saves to file

```go
		ui.ShowAuthSuccess(userInfo.Email)
		return nil
```

- Shows success:
  - Displays user email
  - Returns success

```go
	case err := <-errorResult:
		return err
```

- Handles error:
  - If error channel receives error, return it

```go
	case <-ctx.Done():
		server.Shutdown(context.Background())
		return ctx.Err()
```

- Handles cancellation:
  - If context cancelled (Ctrl+C), shutdown server and return

```go
	case <-time.After(5 * time.Minute):
		server.Shutdown(context.Background())
		return fmt.Errorf("authentication timeout")
	}
}
```

- Handles timeout:
  - If 5 minutes pass, timeout and return error

```go
// exchangeCodeForToken exchanges an authorization code for access token
func (e *EnkryptifyAuth) exchangeCodeForToken(code, codeVerifier string) (*AuthResponse, error) {
```

- Exchanges code for token:
  - Takes authorization code and verifier
  - Returns token response

```go
	payload := map[string]interface{}{
		"grant_type":    "authorization_code",
		"client_id":     ClientID,
		"code":          code,
		"redirect_uri":  RedirectURL,
		"code_verifier": codeVerifier,
	}
```

- Creates request payload:
  - OAuth parameters for token exchange

```go
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
```

- Converts to JSON:
  - Marshals payload to JSON

```go
	req, err := http.NewRequest("POST", TokenEndpoint, strings.NewReader(string(jsonData)))
	if err != nil {
		return nil, err
	}
```

- Creates HTTP request:
  - POST to token endpoint
  - Body contains JSON payload

```go
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
```

- Sets headers:
  - Content-Type and Accept headers

```go
	resp, err := e.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
```

- Makes request:
  - Sends HTTP request
  - Closes body when done

```go
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("token exchange failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}
```

- Checks status:
  - If not 200 OK, return error

```go
	var authResp AuthResponse
	decoder := json.NewDecoder(resp.Body)
	if err := decoder.Decode(&authResp); err != nil {
		return nil, fmt.Errorf("failed to decode token response: %w", err)
	}

	return &authResp, nil
}
```

- Decodes response:
  - Parses JSON response
  - Returns token response

```go
// GetUserInfo retrieves user information using an access token
func (e *EnkryptifyAuth) GetUserInfo(accessToken string) (*UserInfo, error) {
```

- Gets user info:
  - Takes access token
  - Returns user info

```go
	req, err := http.NewRequest("GET", UserInfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
```

- Creates GET request:
  - To user info endpoint

```go
	req.Header.Set("X-API-Key", accessToken)
	req.Header.Set("Accept", "application/json")
```

- Sets headers:
  - Token in `X-API-Key` header
  - Accept JSON

```go
	resp, err := e.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
```

- Makes request:
  - Sends HTTP request

```go
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get user info, status: %d", resp.StatusCode)
	}
```

- Checks status:
  - If not 200 OK, return error

```go
	var userInfo UserInfo
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, err
	}

	return &userInfo, nil
}
```

- Decodes response:
  - Parses JSON
  - Returns user info

```go
// IsAuthenticated checks if the user is authenticated
func (e *EnkryptifyAuth) IsAuthenticated() (bool, error) {
	// Check for environment variable token first (for server environments)
	if token := os.Getenv(EnvTokenKey); token != "" {
		return true, nil
	}

	return e.keyring.IsAuthenticated("enkryptify")
}
```

- Checks authentication:
  - First checks environment variable
  - Then checks keyring
  - Returns true if token exists

```go
// Logout removes stored authentication information
func (e *EnkryptifyAuth) Logout() error {
	if err := e.keyring.DeleteAuthInfo("enkryptify"); err != nil {
		return fmt.Errorf("failed to delete auth info: %w", err)
	}

	ui.PrintSuccess("Successfully logged out from Enkryptify")
	return nil
}
```

- Logs out:
  - Deletes token from keyring
  - Shows success message

```go
// GetAccessToken retrieves the current access token
func (e *EnkryptifyAuth) GetAccessToken() (string, error) {
	// Check for environment variable token first (for server environments)
	if token := os.Getenv(EnvTokenKey); token != "" {
		return token, nil
	}
```

- Gets access token:
  - First checks environment variable

```go
	authInfo, err := e.keyring.GetAuthInfo("enkryptify")
	if err != nil {
		return "", err
	}

	if authInfo == nil {
		return "", fmt.Errorf("not authenticated")
	}
```

- Gets from keyring:
  - Reads token from keyring
  - If not found, returns error

```go
	// Check if token is expired (with 5 minute buffer)
	if authInfo.ExpiresAt > 0 && time.Now().Unix() > (authInfo.ExpiresAt-300) {
		return "", fmt.Errorf("access token expired, please run login command")
	}

	return authInfo.AccessToken, nil
}
```

- Checks expiration:
  - If expired (with 5 min buffer), returns error
  - Otherwise returns token

```go
func showAuthInstructions(authURL string) {
	ui.PrintTitle("🔐 Enkryptify Authentication")
	ui.PrintSubtitle("To authenticate with Enkryptify, please follow these steps:")

	fmt.Println()
	ui.PrintInfo("1. A web browser will open automatically")
	ui.PrintInfo("2. If the browser doesn't open, manually visit the URL below")
	ui.PrintInfo("3. Sign in to your Enkryptify account")
	ui.PrintInfo("4. Authorize the CLI application")
	ui.PrintInfo("5. Return to this terminal once you've completed the authorization")

	ui.PrintSeparator()

	fmt.Println()
	ui.PrintInfo("Authentication URL:\n" + authURL)
	fmt.Println()

	ui.PrintSeparator()
}
```

- Shows instructions:
  - Displays step-by-step instructions
  - Shows authentication URL

**Summary**: This file implements OAuth 2.0 with PKCE flow. It generates PKCE parameters, starts a local callback server, opens browser for user to login, waits for callback, exchanges code for token, and stores token in keyring. It also provides functions to check authentication, get tokens, get user info, and logout.

---

## config/config.go

**File**: `internal/config/config.go`  
**Purpose**: Manages the main CLI configuration file (authentication status, default provider)

### Line-by-Line Explanation

```go
package config
```

- Part of the `config` package

```go
import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/mitchellh/go-homedir"
)
```

- Imports:
  - Standard library: encoding/json, fmt, os, path/filepath
  - External: go-homedir (gets user home directory)

```go
// Config represents the CLI configuration
type Config struct {
	DefaultProvider string            `json:"default_provider"`
	Providers       map[string]Provider `json:"providers"`
}
```

- Config struct:
  - `DefaultProvider`: Which provider to use by default (e.g., "enkryptify")
  - `Providers`: Map of provider names to provider configs

```go
// Provider represents a secrets provider configuration
type Provider struct {
	Type     string                 `json:"type"`
	Settings map[string]interface{} `json:"settings"`
}
```

- Provider struct:
  - `Type`: Provider type (e.g., "enkryptify")
  - `Settings`: Provider-specific settings (e.g., authenticated: true, last_login: timestamp)

```go
// AuthInfo represents authentication information
type AuthInfo struct {
	AccessToken  string `json:"access_token"`
	ExpiresAt    int64  `json:"expires_at,omitempty"`
	UserID       string `json:"user_id,omitempty"`
	Email        string `json:"email,omitempty"`
}
```

- AuthInfo struct:
  - Used for storing tokens (but actual storage is in keyring, not this file)
  - `AccessToken`: The token
  - `ExpiresAt`: Expiration timestamp
  - `UserID`: User ID
  - `Email`: User email

```go
const (
	ConfigFileName = ".enkryptify"
	ConfigDirName  = "enkryptify"
)
```

- Constants:
  - Config directory/file names

```go
// GetConfigDir returns the configuration directory path
func GetConfigDir() (string, error) {
	home, err := homedir.Dir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	configDir := filepath.Join(home, ".config", ConfigDirName)
	return configDir, nil
}
```

- Gets config directory:
  - Gets user home directory
  - Returns `~/.config/enkryptify`

```go
// GetConfigPath returns the full path to the config file
func GetConfigPath() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configDir, "config.json"), nil
}
```

- Gets config file path:
  - Returns `~/.config/enkryptify/config.json`

```go
// LoadConfig loads the configuration from disk
func LoadConfig() (*Config, error) {
	configPath, err := GetConfigPath()
	if err != nil {
		return nil, err
	}
```

- Loads config:
  - Gets config file path

```go
	// Return default config if file doesn't exist
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return &Config{
			DefaultProvider: "enkryptify",
			Providers:       make(map[string]Provider),
		}, nil
	}
```

- Handles missing file:
  - If file doesn't exist, returns default config
  - Default provider: "enkryptify"

```go
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}
```

- Reads file:
  - Reads config file contents

```go
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}
```

- Parses JSON:
  - Unmarshals JSON into Config struct

```go
	// Initialize providers map if nil
	if config.Providers == nil {
		config.Providers = make(map[string]Provider)
	}

	return &config, nil
}
```

- Initializes providers:
  - If nil, creates empty map
  - Returns config

```go
// SaveConfig saves the configuration to disk
func (c *Config) Save() error {
	configPath, err := GetConfigPath()
	if err != nil {
		return err
	}
```

- Saves config:
  - Gets config file path

```go
	// Ensure config directory exists
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}
```

- Creates directory:
  - Creates config directory if it doesn't exist
  - Permissions: 0755 (read/write/execute for owner, read/execute for others)

```go
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}
```

- Converts to JSON:
  - Marshals config to JSON with indentation

```go
	if err := os.WriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}
```

- Writes file:
  - Writes JSON to file
  - Permissions: 0600 (read/write for owner only)

```go
// SetProvider sets the configuration for a specific provider
func (c *Config) SetProvider(name string, provider Provider) {
	c.Providers[name] = provider
}
```

- Sets provider:
  - Updates provider in map

```go
// GetProvider gets the configuration for a specific provider
func (c *Config) GetProvider(name string) (Provider, bool) {
	provider, exists := c.Providers[name]
	return provider, exists
}
```

- Gets provider:
  - Returns provider and whether it exists

```go
// SetDefaultProvider sets the default provider
func (c *Config) SetDefaultProvider(name string) {
	c.DefaultProvider = name
}
```

- Sets default provider:
  - Updates default provider name

**Summary**: This file manages the main CLI configuration file (`~/.config/enkryptify/config.json`). It stores which providers are authenticated and which is the default provider. It does NOT store actual tokens (those are in the keyring). Provides functions to load, save, get, and set provider configurations.

---

## config/setup.go

**File**: `internal/config/setup.go`  
**Purpose**: Manages the setup configuration file (directory → workspace/project/environment mappings)

### Line-by-Line Explanation

```go
package config
```

- Part of the `config` package

```go
import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/mitchellh/go-homedir"
)
```

- Imports:
  - Standard library: encoding/json, fmt, os, path/filepath
  - External: go-homedir

```go
type SetupConfig struct {
	Path          string `json:"path"`
	WorkspaceSlug string `json:"workspace_slug"`
	ProjectSlug   string `json:"project_slug"`
	EnvironmentID string `json:"environment_id"`
}
```

- SetupConfig struct:
  - `Path`: Directory path (e.g., "/Users/ali/my-project")
  - `WorkspaceSlug`: Enkryptify workspace slug
  - `ProjectSlug`: Enkryptify project slug
  - `EnvironmentID`: Enkryptify environment ID

```go
type SetupStorage struct {
	Setups []SetupConfig `json:"setups"`
}
```

- SetupStorage struct:
  - `Setups`: Array of setup configs (one per directory)

```go
func GetSetupConfigPath() (string, error) {
	home, err := homedir.Dir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	return filepath.Join(home, ".enkryptify", "config.json"), nil
}
```

- Gets setup config path:
  - Returns `~/.enkryptify/config.json`
  - **Note**: Different file from `~/.config/enkryptify/config.json`!

```go
func LoadSetupStorage() (*SetupStorage, error) {
	configPath, err := GetSetupConfigPath()
	if err != nil {
		return nil, err
	}
```

- Loads setup storage:
  - Gets config file path

```go
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return &SetupStorage{
			Setups: []SetupConfig{},
		}, nil
	}
```

- Handles missing file:
  - If file doesn't exist, returns empty storage

```go
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read setup config file: %w", err)
	}
```

- Reads file:
  - Reads config file contents

```go
	var storage SetupStorage
	if err := json.Unmarshal(data, &storage); err != nil {
		return nil, fmt.Errorf("failed to parse setup config file: %w", err)
	}
```

- Parses JSON:
  - Unmarshals JSON into SetupStorage struct

```go
	if storage.Setups == nil {
		storage.Setups = []SetupConfig{}
	}

	return &storage, nil
}
```

- Initializes setups:
  - If nil, creates empty array
  - Returns storage

```go
func (s *SetupStorage) Save() error {
	configPath, err := GetSetupConfigPath()
	if err != nil {
		return err
	}
```

- Saves setup storage:
  - Gets config file path

```go
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}
```

- Creates directory:
  - Creates config directory if it doesn't exist

```go
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal setup config: %w", err)
	}
```

- Converts to JSON:
  - Marshals storage to JSON with indentation

```go
	if err := os.WriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write setup config file: %w", err)
	}

	return nil
}
```

- Writes file:
  - Writes JSON to file
  - Permissions: 0600

```go
func (s *SetupStorage) HasSetupForPath(path string) bool {
	for _, setup := range s.Setups {
		if setup.Path == path {
			return true
		}
	}
	return false
}
```

- Checks if setup exists:
  - Loops through setups
  - Returns true if path matches

```go
func (s *SetupStorage) AddOrUpdateSetup(setup SetupConfig) {
	for i, existingSetup := range s.Setups {
		if existingSetup.Path == setup.Path {
			s.Setups[i] = setup
			return
		}
	}
	s.Setups = append(s.Setups, setup)
}
```

- Adds or updates setup:
  - If path exists, updates it
  - Otherwise, appends new setup

```go
func (s *SetupStorage) GetSetupForPath(path string) *SetupConfig {
	for _, setup := range s.Setups {
		if setup.Path == path {
			return &setup
		}
	}
	return nil
}
```

- Gets setup for path:
  - Loops through setups
  - Returns matching setup or nil

```go
func GetCurrentWorkingDirectory() (string, error) {
	return os.Getwd()
}
```

- Gets current directory:
  - Returns current working directory path

**Summary**: This file manages the setup configuration file (`~/.enkryptify/config.json`). It stores mappings between directories and Enkryptify workspace/project/environment configurations. Provides functions to load, save, check, get, and add/update setups.

---

## inject/env.go

**File**: `internal/inject/env.go`  
**Purpose**: Fetches secrets from Enkryptify and injects them as environment variables for a command

### Line-by-Line Explanation

```go
package inject
```

- Part of the `inject` package

```go
import (
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"github.com/Enkryptify/cli/internal/providers/enkryptify"
)
```

- Imports:
  - Standard library: fmt, os, os/exec, syscall
  - Internal: enkryptify provider

```go
// SecretToEnvVar converts a secret to environment variable format
func SecretToEnvVar(secret enkryptify.Secret, environmentID string) (string, string, error) {
```

- Converts secret to env var:
  - Takes secret and environment ID
  - Returns name, value, error

```go
	// Find the value for the specific environment
	for _, value := range secret.Values {
		if value.EnvironmentID == environmentID {
			return secret.Name, value.Value, nil
		}
	}
```

- Finds value for environment:
  - Loops through secret values
  - Returns name and value for matching environment

```go
	return "", "", fmt.Errorf("no value found for secret %s in environment %s", secret.Name, environmentID)
}
```

- Returns error:
  - If no value found for environment

```go
// InjectSecretsAndRun fetches secrets and runs the command with them as environment variables
func InjectSecretsAndRun(workspaceSlug, projectSlug, environmentID string, command []string) error {
```

- Main injection function:
  - Takes workspace/project/environment IDs
  - Takes command to run
  - Returns error if fails

```go
	if len(command) == 0 {
		return fmt.Errorf("no command provided")
	}
```

- Validates command:
  - If empty, returns error

```go
	// Create enkryptify client
	client := enkryptify.NewClient()
```

- Creates API client:
  - Creates Enkryptify API client

```go
	// Fetch secrets
	secrets, err := client.GetSecrets(workspaceSlug, projectSlug, environmentID)
	if err != nil {
		return fmt.Errorf("failed to fetch secrets: %w", err)
	}
```

- Fetches secrets:
  - Makes API call to get secrets
  - If error, returns error

```go
	// Convert secrets to environment variables
	envVars := os.Environ() // Start with current environment
```

- Starts with current environment:
  - Gets existing environment variables
  - Will add secrets to this list

```go
	for _, secret := range secrets {
		name, value, err := SecretToEnvVar(secret, environmentID)
		if err != nil {
			// Log warning but don't fail - secret might not have value for this environment
			continue
		}
		envVars = append(envVars, fmt.Sprintf("%s=%s", name, value))
	}
```

- Converts secrets to env vars:
  - Loops through secrets
  - Converts each to "NAME=VALUE" format
  - Appends to environment variables list
  - If error (no value for environment), skips it

```go
	// Prepare command
	cmd := exec.Command(command[0], command[1:]...)
```

- Creates command:
  - First element is command name
  - Rest are arguments

```go
	cmd.Env = envVars
```

- **Sets environment variables**:
  - This is where injection happens!
  - Command will have access to secrets as env vars

```go
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
```

- Connects streams:
  - Stdout/stderr/stdin connected to terminal

```go
	// Run command and wait for completion
	if err := cmd.Run(); err != nil {
```

- Runs command:
  - Executes command
  - Waits for completion

```go
		if exitError, ok := err.(*exec.ExitError); ok {
			// Command failed with non-zero exit code
			if status, ok := exitError.Sys().(syscall.WaitStatus); ok {
				os.Exit(status.ExitStatus())
			}
		}
		return fmt.Errorf("failed to execute command: %w", err)
	}
```

- Handles errors:
  - If command failed, gets exit code
  - Exits with same exit code
  - Otherwise returns error

```go
	return nil
}
```

- Returns success

**Summary**: This file fetches secrets from Enkryptify API, converts them to environment variables, and runs the user's command with those environment variables. This is where the actual secret injection happens - secrets become available to the command as environment variables.

---

# How Everything Works Together

Now that we've explained each file individually, let's see how they all work together in complete flows.

---

## Complete Flow: `ek login`

```
User types: ek login
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  cmd/root.go                                                │
│  • rootCmd.Execute() parses command                         │
│  • Routes to loginCmd                                       │
└──────────────┬────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  cmd/login.go - runLogin()                                  │
│  1. Shows brand header (ui.ShowBrandHeader())               │
│  2. Sets up cancellation handling (Ctrl+C)                │
│  3. Loads config (config.LoadConfig())                     │
│     → Uses: internal/config/config.go                       │
│     → Reads: ~/.config/enkryptify/config.json              │
│  4. Creates auth handler (auth.NewEnkryptifyAuth())        │
│     → Uses: internal/auth/enkryptify.go                     │
│  5. Checks if already authenticated                        │
│     → Calls: enkryptifyAuth.IsAuthenticated()              │
│     → Checks: keyring for token                            │
│  6. If authenticated, verifies token                      │
│     → Calls: enkryptifyAuth.GetUserInfo()                 │
│     → Makes API call to verify token                       │
│     → If valid: Shows success, EXITS                      │
│  7. If not authenticated, starts OAuth flow               │
│     → Calls: enkryptifyAuth.Login(loginCtx)                │
│     → Delegates to: internal/auth/enkryptify.go            │
└──────────────┬────────────────────────────────────────────┘
               │
               │ Calls:
               ▼
┌─────────────────────────────────────────────────────────────┐
│  internal/auth/enkryptify.go - Login()                     │
│  1. Checks env token (if set, exits early)                 │
│  2. Loads config (config.LoadConfig())                     │
│  3. Checks if authenticated (double-check)                 │
│  4. Generates PKCE parameters                              │
│     → codeVerifier: random secret                          │
│     → codeChallenge: hash of verifier                      │
│  5. Generates state parameter (CSRF protection)            │
│  6. Starts local callback server                            │
│     → Listens on port 51823                                │
│     → Handles /callback endpoint                           │
│  7. Builds OAuth URL                                       │
│     → Includes: client_id, redirect_uri, scope, state,    │
│                  code_challenge                            │
│  8. Opens browser (browser.OpenURL())                     │
│  9. Waits for callback (select statement)                 │
│     → User logs in browser                                 │
│     → OAuth server redirects to localhost:51823/callback  │
│  10. Callback handler receives code                        │
│      → Verifies state parameter                            │
│      → Exchanges code for token                            │
│      → Calls: exchangeCodeForToken()                      │
│  11. Stores token in keyring                               │
│      → Calls: keyring.StoreAuthInfo()                     │
│  12. Updates config                                        │
│      → Calls: config.SetProvider()                        │
│      → Calls: config.Save()                                │
│  13. Shows success                                         │
│      → Returns to cmd/login.go                             │
└──────────────┬────────────────────────────────────────────┘
               │
               │ Returns to:
               ▼
┌─────────────────────────────────────────────────────────────┐
│  cmd/login.go - runLogin() (continued)                     │
│  • After Login() returns successfully:                     │
│  • Updates config (already done in auth, but does again)  │
│  • Saves config                                            │
│  • Returns success                                         │
└─────────────────────────────────────────────────────────────┘
```

**Result**: User is authenticated, token stored in keyring, config file updated.

---

## Complete Flow: `ek setup`

```
User types: ek setup
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  cmd/root.go                                                │
│  • Routes to setupCmd                                       │
└──────────────┬────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  cmd/setup.go - runSetup()                                  │
│  1. Validates authentication                               │
│     → Calls: ValidateAuthentication()                      │
│     → Uses: cmd/login.go helper                            │
│  2. Gets current directory                                 │
│     → Calls: config.GetCurrentWorkingDirectory()           │
│     → Uses: internal/config/setup.go                       │
│  3. Loads setup storage                                     │
│     → Calls: config.LoadSetupStorage()                     │
│     → Uses: internal/config/setup.go                       │
│     → Reads: ~/.enkryptify/config.json                    │
│  4. Creates API client                                     │
│     → Calls: enkryptify.NewClient()                        │
│  5. Checks for env token                                   │
│     → If set: runNonInteractiveSetup()                    │
│     → Otherwise: runInteractiveSetup()                   │
└──────────────┬────────────────────────────────────────────┘
               │
               │ Interactive path:
               ▼
┌─────────────────────────────────────────────────────────────┐
│  cmd/setup.go - runInteractiveSetup()                      │
│  1. Shows UI (brand header, title)                         │
│  2. Checks if setup exists for directory                   │
│     → Calls: setupStorage.HasSetupForPath()               │
│     → If exists: Asks user to confirm overwrite          │
│  3. Fetches workspaces                                     │
│     → Calls: client.GetWorkspaces()                       │
│     → Makes API call                                       │
│  4. User selects workspace                                 │
│     → Calls: ui.SelectFromList()                          │
│  5. Fetches projects                                       │
│     → Calls: client.GetProjects()                         │
│     → Makes API call                                       │
│  6. User selects project                                   │
│     → Calls: ui.SelectFromList()                          │
│  7. Fetches environments                                   │
│     → Calls: client.GetProjectDetail()                    │
│     → Makes API call                                       │
│  8. User selects environment                               │
│     → Calls: ui.SelectFromList()                          │
│  9. Creates setup config                                   │
│     → Links directory to workspace/project/environment    │
│  10. Saves setup                                           │
│      → Calls: setupStorage.AddOrUpdateSetup()             │
│      → Calls: setupStorage.Save()                         │
│      → Uses: internal/config/setup.go                      │
│      → Writes: ~/.enkryptify/config.json                  │
│  11. Shows success message                                 │
└─────────────────────────────────────────────────────────────┘
```

**Result**: Directory is linked to Enkryptify workspace/project/environment. Configuration saved to `~/.enkryptify/config.json`. **No secrets are fetched yet!**

---

## Complete Flow: `ek run -- npm start`

```
User types: ek run -- npm start
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  cmd/root.go                                                │
│  • Routes to runCmd                                         │
└──────────────┬────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  cmd/run.go - runRunCommand()                               │
│  1. Validates authentication                               │
│     → Calls: ValidateAuthentication()                     │
│     → Uses: cmd/login.go helper                            │
│     → Checks: keyring for token                            │
│  2. Gets current directory                                 │
│     → Calls: config.GetCurrentWorkingDirectory()           │
│     → Uses: internal/config/setup.go                       │
│     → Returns: "/Users/ali/my-project"                     │
│  3. Loads setup storage                                     │
│     → Calls: config.LoadSetupStorage()                     │
│     → Uses: internal/config/setup.go                       │
│     → Reads: ~/.enkryptify/config.json                    │
│  4. Finds setup for directory                              │
│     → Calls: setupStorage.GetSetupForPath()               │
│     → Uses: internal/config/setup.go                       │
│     → Returns: {workspace: "my-workspace",                 │
│                 project: "my-app",                         │
│                 environment: "prod-123"}                   │
│  5. Parses command arguments                                │
│     → Finds "--" separator                                │
│     → Extracts: ["npm", "start"]                          │
│  6. Shows info message                                      │
│     → Which workspace/project secrets come from           │
│     → Command that will run                               │
│  7. Calls injection function                               │
│     → Calls: inject.InjectSecretsAndRun()                 │
│     → Passes: workspace/project/environment IDs           │
│     → Passes: command ["npm", "start"]                    │
│     → Delegates to: internal/inject/env.go                 │
└──────────────┬────────────────────────────────────────────┘
               │
               │ Calls:
               ▼
┌─────────────────────────────────────────────────────────────┐
│  internal/inject/env.go - InjectSecretsAndRun()             │
│  1. Creates API client                                     │
│     → Calls: enkryptify.NewClient()                        │
│  2. Fetches secrets                                        │
│     → Calls: client.GetSecrets()                          │
│     → Makes API call:                                      │
│       GET /workspace/my-workspace/project/my-app/secret?  │
│       environmentId=prod-123                               │
│     → Uses: access token from keyring                     │
│     → Returns: [{name: "DATABASE_URL", value: "..."},     │
│                 {name: "API_KEY", value: "..."}]           │
│  3. Converts secrets to environment variables              │
│     → Starts with: os.Environ() (current env vars)        │
│     → Loops through secrets                               │
│     → Converts each to "NAME=VALUE" format                │
│     → Result: ["PATH=/usr/bin",                            │
│                "HOME=/Users/ali",                          │
│                "DATABASE_URL=postgres://...",              │
│                "API_KEY=secret-123"]                      │
│  4. Creates command                                        │
│     → exec.Command("npm", "start")                         │
│  5. Sets environment variables                             │
│     → cmd.Env = envVars                                    │
│     → **THIS IS WHERE INJECTION HAPPENS!**                 │
│  6. Connects streams                                       │
│     → cmd.Stdout = os.Stdout                              │
│     → cmd.Stderr = os.Stderr                              │
│     → cmd.Stdin = os.Stdin                                │
│  7. Runs command                                           │
│     → cmd.Run()                                            │
│     → npm start now has DATABASE_URL and API_KEY!         │
│  8. Waits for completion                                  │
│     → Command runs with secrets as env vars               │
│     → Returns when command finishes                       │
└─────────────────────────────────────────────────────────────┘
```

**Result**: `npm start` runs with secrets injected as environment variables. The Node.js app can access `process.env.DATABASE_URL` and `process.env.API_KEY`!

---

## File Relationships Summary

```
┌─────────────────────────────────────────────────────────────┐
│  cmd/ (Command Handlers)                                    │
│  • root.go: Entry point, routes commands                   │
│  • login.go: Handles "ek login"                            │
│    → Uses: auth/enkryptify.go, config/config.go            │
│  • setup.go: Handles "ek setup"                            │
│    → Uses: config/setup.go, providers/enkryptify/          │
│  • run.go: Handles "ek run"                                │
│    → Uses: config/setup.go, inject/env.go                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Calls functions from:
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  internal/ (Implementation)                                 │
│  • auth/enkryptify.go: OAuth flow, token management        │
│    → Uses: config/config.go, keyring/                      │
│  • config/config.go: Main CLI config                       │
│    → File: ~/.config/enkryptify/config.json              │
│  • config/setup.go: Directory mappings                    │
│    → File: ~/.enkryptify/config.json                      │
│  • inject/env.go: Secret fetching and injection          │
│    → Uses: providers/enkryptify/                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

1. **Separation of Concerns**:

   - `cmd/` files handle CLI, UI, coordination
   - `internal/` files do actual work (API calls, file ops)

2. **Two Config Files**:

   - `~/.config/enkryptify/config.json`: Authentication status, default provider
   - `~/.enkryptify/config.json`: Directory → workspace/project/environment mappings

3. **Token Storage**:

   - Tokens stored in OS keyring (secure)
   - Config files only store status flags, not actual tokens

4. **Setup vs Run**:

   - `ek setup`: Only saves configuration (which workspace/project/environment to use)
   - `ek run`: Fetches secrets and injects them as environment variables

5. **Authentication Flow**:
   - OAuth 2.0 with PKCE
   - Local callback server receives redirect
   - Token stored in keyring
   - Config file updated with status

---

## Conclusion

This CLI tool allows developers to securely inject secrets from Enkryptify into their applications without hardcoding them. The architecture separates concerns cleanly: command handlers coordinate the flow, while implementation files do the actual work. Secrets are fetched on-demand when running commands, ensuring they're always up-to-date and never stored in code.
