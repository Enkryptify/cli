package auth

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
	"strings"
	"time"

	"github.com/pkg/browser"

	"github.com/Enkryptify/cli/internal/config"
	"github.com/Enkryptify/cli/internal/keyring"
	"github.com/Enkryptify/cli/internal/ui"
)

const (
	ClientID           = "enkryptify-cli"
	AuthBaseURL        = "http://localhost:3000"
	TokenEndpoint      = "http://localhost:8080/v1/auth/token"
	UserInfoEndpoint   = "http://localhost:8080/v1/me"
	RedirectURL        = "http://localhost:51823/callback"
	CallbackPort       = "51823"
	DefaultScopes      = "openid profile email secrets:read secrets:write"
)

// EnkryptifyAuth handles authentication with Enkryptify
type EnkryptifyAuth struct {
	keyring    *keyring.Store
	config     *config.Config
	httpClient *http.Client
}

// NewEnkryptifyAuth creates a new Enkryptify authentication handler
func NewEnkryptifyAuth() *EnkryptifyAuth {
	return &EnkryptifyAuth{
		keyring:    keyring.NewStore(),
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// AuthResponse represents the response from the authentication server
type AuthResponse struct {
	AccessToken  string `json:"accessToken"`
	TokenType    string `json:"tokenType"`
	ExpiresIn    int64  `json:"expiresIn,omitempty"`
}

// UserInfo represents user information from the API
type UserInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

// generateCodeVerifier generates a code verifier for PKCE
func generateCodeVerifier() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

// generateCodeChallenge generates a code challenge from a code verifier
func generateCodeChallenge(verifier string) string {
	sha := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sha[:])
}

// Login performs the OAuth login flow with Enkryptify
func (e *EnkryptifyAuth) Login(ctx context.Context) error {
	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}
	e.config = cfg

	// Check if already authenticated
	authenticated, err := e.IsAuthenticated()
	if err != nil {
		return fmt.Errorf("failed to check authentication status: %w", err)
	}
	
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
		// If we can't get user info, continue with login
	}

	// Generate PKCE parameters
	codeVerifier, err := generateCodeVerifier()
	if err != nil {
		return fmt.Errorf("failed to generate code verifier: %w", err)
	}
	codeChallenge := generateCodeChallenge(codeVerifier)

	// Generate state parameter for security
	state, err := generateCodeVerifier()
	if err != nil {
		return fmt.Errorf("failed to generate state: %w", err)
	}

	// Start local callback server
	authResult := make(chan AuthResponse, 1)
	errorResult := make(chan error, 1)
	
	server := &http.Server{Addr: ":" + CallbackPort}
	
	http.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		defer server.Shutdown(context.Background())
		
		// Check for errors
		if errCode := r.URL.Query().Get("error"); errCode != "" {
			errDesc := r.URL.Query().Get("error_description")
			if errDesc == "" {
				errDesc = errCode
			}
			
			// Show error page
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, `
				<html>
					<head><title>Authentication Error</title></head>
					<body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
						<h2 style="color: #FF5F56;">Authentication Error</h2>
						<p>%s</p>
						<p>You can close this window and try again.</p>
					</body>
				</html>
			`, errDesc)
			
			errorResult <- fmt.Errorf("authentication error: %s", errDesc)
			return
		}
		
		// Verify state parameter
		receivedState := r.URL.Query().Get("state")
		if receivedState != state {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, "Invalid state parameter")
			errorResult <- fmt.Errorf("invalid state parameter")
			return
		}
		
		// Get authorization code
		code := r.URL.Query().Get("code")
		if code == "" {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, "Missing authorization code")
			errorResult <- fmt.Errorf("missing authorization code")
			return
		}
		
		// Exchange code for token
		authResp, err := e.exchangeCodeForToken(code, codeVerifier)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintf(w, "Failed to exchange code for token")
			errorResult <- fmt.Errorf("failed to exchange code for token: %w", err)
			return
		}
		
		// Show success page
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `
			<html>
				<head><title>Authentication Successful</title></head>
				<body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
					<h2 style="color: #28CA42;">✓ Authentication Successful!</h2>
					<p>You have successfully authenticated with Enkryptify.</p>
					<p>You can now close this window and return to your terminal.</p>
				</body>
			</html>
		`)
		
		authResult <- *authResp
	})
	
	// Start the server in a goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errorResult <- fmt.Errorf("failed to start callback server: %w", err)
		}
	}()
	
	// Wait for server to start
	time.Sleep(100 * time.Millisecond)
	
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
	
	// Show instructions and open browser
	ui.ShowAuthInstructions(authURL)
	
	if err := browser.OpenURL(authURL); err != nil {
		ui.PrintWarning("Failed to open browser automatically. Please open the URL manually.")
	}
	
	ui.ShowWaitingForAuth()
	
	// Wait for authentication result
	select {
	case authResp := <-authResult:
		// Get user info
		userInfo, err := e.GetUserInfo(authResp.AccessToken)
		if err != nil {
			return fmt.Errorf("failed to get user info: %w", err)
		}
		
		// Store authentication info
		authInfo := &config.AuthInfo{
			AccessToken:  authResp.AccessToken,
			ExpiresAt:    time.Now().Unix() + authResp.ExpiresIn,
			UserID:       userInfo.ID,
			Email:        userInfo.Email,
		}
		
		if err := e.keyring.StoreAuthInfo("enkryptify", authInfo); err != nil {
			return fmt.Errorf("failed to store auth info: %w", err)
		}
		
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
		
		ui.ShowAuthSuccess(userInfo.Email)
		return nil
		
	case err := <-errorResult:
		return err
		
	case <-ctx.Done():
		server.Shutdown(context.Background())
		return ctx.Err()
		
	case <-time.After(5 * time.Minute):
		server.Shutdown(context.Background())
		return fmt.Errorf("authentication timeout")
	}
}

// exchangeCodeForToken exchanges an authorization code for access token
func (e *EnkryptifyAuth) exchangeCodeForToken(code, codeVerifier string) (*AuthResponse, error) {
	payload := map[string]interface{}{
		"grant_type":    "authorization_code",
		"client_id":     ClientID,
		"code":          code,
		"redirect_uri":  RedirectURL,
		"code_verifier": codeVerifier,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", TokenEndpoint, strings.NewReader(string(jsonData)))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	
	resp, err := e.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("token exchange failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var authResp AuthResponse
	decoder := json.NewDecoder(resp.Body)
	if err := decoder.Decode(&authResp); err != nil {
		return nil, fmt.Errorf("failed to decode token response: %w", err)
	}
	
	return &authResp, nil
}

// GetUserInfo retrieves user information using an access token
func (e *EnkryptifyAuth) GetUserInfo(accessToken string) (*UserInfo, error) {
	req, err := http.NewRequest("GET", UserInfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	
	resp, err := e.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get user info, status: %d", resp.StatusCode)
	}
	
	var userInfo UserInfo
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, err
	}
	
	return &userInfo, nil
}

// IsAuthenticated checks if the user is authenticated
func (e *EnkryptifyAuth) IsAuthenticated() (bool, error) {
	return e.keyring.IsAuthenticated("enkryptify")
}

// Logout removes stored authentication information
func (e *EnkryptifyAuth) Logout() error {
	if err := e.keyring.DeleteAuthInfo("enkryptify"); err != nil {
		return fmt.Errorf("failed to delete auth info: %w", err)
	}
	
	ui.PrintSuccess("Successfully logged out from Enkryptify")
	return nil
}

// GetAccessToken retrieves the current access token
func (e *EnkryptifyAuth) GetAccessToken() (string, error) {
	authInfo, err := e.keyring.GetAuthInfo("enkryptify")
	if err != nil {
		return "", err
	}
	
	if authInfo == nil {
		return "", fmt.Errorf("not authenticated")
	}
	
	// Check if token is expired (with 5 minute buffer)
	if authInfo.ExpiresAt > 0 && time.Now().Unix() > (authInfo.ExpiresAt-300) {
		// Token is expired, try to refresh if we have a refresh token
		if authInfo.RefreshToken != "" {
			newToken, err := e.refreshAccessToken(authInfo.RefreshToken)
			if err != nil {
				return "", fmt.Errorf("failed to refresh token: %w", err)
			}
			return newToken, nil
		}
		return "", fmt.Errorf("access token expired and no refresh token available")
	}
	
	return authInfo.AccessToken, nil
}

// refreshAccessToken refreshes an expired access token
func (e *EnkryptifyAuth) refreshAccessToken(refreshToken string) (string, error) {
	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("client_id", ClientID)
	data.Set("refresh_token", refreshToken)
	
	req, err := http.NewRequest("POST", TokenEndpoint, strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	
	resp, err := e.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token refresh failed with status %d", resp.StatusCode)
	}
	
	var authResp AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return "", err
	}
	
	// Update stored auth info
	authInfo, err := e.keyring.GetAuthInfo("enkryptify")
	if err != nil {
		return "", err
	}
	
	authInfo.AccessToken = authResp.AccessToken
	if authResp.ExpiresIn > 0 {
		authInfo.ExpiresAt = time.Now().Unix() + authResp.ExpiresIn
	}
	
	if err := e.keyring.StoreAuthInfo("enkryptify", authInfo); err != nil {
		return "", fmt.Errorf("failed to update auth info: %w", err)
	}
	
	return authResp.AccessToken, nil
}
