package cmd

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

var (
	loginForce bool
	loginHelp  bool
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with Enkryptify",
	Long: `Authenticate with Enkryptify to access your secrets.

This command will open a web browser to complete the OAuth authentication flow.
After successful authentication, your credentials will be securely stored
in your system's keyring.

Examples:
  ek login              # Login with default provider (Enkryptify)
  ek login --force      # Force re-authentication even if already logged in
  ek login --help       # Show this help message`,
	
	RunE: runLogin,
}

func init() {
	// Add flags
	loginCmd.Flags().BoolVarP(&loginForce, "force", "f", false, "Force re-authentication even if already logged in")
	loginCmd.Flags().BoolVarP(&loginHelp, "help", "h", false, "Show help for login command")
	
	// Add login command to root
	rootCmd.AddCommand(loginCmd)
}

func runLogin(cmd *cobra.Command, args []string) error {
	// Show help if requested
	if loginHelp {
		return cmd.Help()
	}

	// Show brand header
	ui.ShowBrandHeader()

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	
	go func() {
		<-sigChan
		ui.PrintWarning("Login cancelled by user")
		cancel()
	}()

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		ui.ShowAuthError(fmt.Errorf("failed to load configuration: %w", err))
		return err
	}

	// Initialize Enkryptify auth
	enkryptifyAuth := auth.NewEnkryptifyAuth()

	// Check if already authenticated (unless force flag is used)
	if !loginForce {
		authenticated, err := enkryptifyAuth.IsAuthenticated()
		if err != nil {
			ui.PrintWarning(fmt.Sprintf("Failed to check authentication status: %v", err))
		} else if authenticated {
			// Try to get user info to verify the token is still valid
			accessToken, err := enkryptifyAuth.GetAccessToken()
			if err == nil {
				userInfo, err := enkryptifyAuth.GetUserInfo(accessToken)
				if err == nil {
					ui.ShowAuthSuccess(userInfo.Email)
					ui.PrintInfo("You are already authenticated. Use --force to re-authenticate.")
					return nil
				}
			}
			// If we can't verify the token, continue with login
			ui.PrintWarning("Existing authentication appears to be invalid. Proceeding with login...")
		}
	}

	// Show current provider info
	ui.ShowProviderInfo("Enkryptify", false)
	
	// Start authentication process
	ui.PrintInfo("Starting authentication with Enkryptify...")
	
	// Create a timeout context for the entire login process
	loginCtx, loginCancel := context.WithTimeout(ctx, 10*time.Minute)
	defer loginCancel()

	// Perform login
	if err := enkryptifyAuth.Login(loginCtx); err != nil {
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

	// Update configuration with successful login
	cfg.SetProvider("enkryptify", config.Provider{
		Type: "enkryptify",
		Settings: map[string]interface{}{
			"authenticated": true,
			"last_login":    time.Now().Unix(),
		},
	})
	
	if err := cfg.Save(); err != nil {
		ui.PrintWarning("Authentication successful, but failed to save configuration.")
	}

	return nil
}

// ValidateAuthentication checks if the user is authenticated with any provider
func ValidateAuthentication() error {
	enkryptifyAuth := auth.NewEnkryptifyAuth()
	
	authenticated, err := enkryptifyAuth.IsAuthenticated()
	if err != nil {
		return fmt.Errorf("failed to check authentication status: %w", err)
	}
	
	if !authenticated {
		return fmt.Errorf("not authenticated - please run 'ek login' first")
	}
	
	// Verify token is still valid
	_, err = enkryptifyAuth.GetAccessToken()
	if err != nil {
		return fmt.Errorf("authentication token is invalid - please run 'ek login' again")
	}
	
	return nil
}

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

// Logout removes stored authentication information
func Logout() error {
	enkryptifyAuth := auth.NewEnkryptifyAuth()
	return enkryptifyAuth.Logout()
}
