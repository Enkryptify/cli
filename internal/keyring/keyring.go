package keyring

import (
	"encoding/json"
	"fmt"

	"github.com/Enkryptify/cli/internal/config"
	"github.com/zalando/go-keyring"
)

const (
	ServiceName = "enkryptify-cli"
)

// Store represents a secure keyring store
type Store struct {
	serviceName string
}

// NewStore creates a new keyring store
func NewStore() *Store {
	return &Store{
		serviceName: ServiceName,
	}
}

// StoreAuthInfo securely stores authentication information for a provider
func (s *Store) StoreAuthInfo(provider string, authInfo *config.AuthInfo) error {
	data, err := json.Marshal(authInfo)
	if err != nil {
		return fmt.Errorf("failed to marshal auth info: %w", err)
	}
	
	key := fmt.Sprintf("%s-auth", provider)
	if err := keyring.Set(s.serviceName, key, string(data)); err != nil {
		return fmt.Errorf("failed to store auth info in keyring: %w", err)
	}
	
	return nil
}

// GetAuthInfo retrieves authentication information for a provider
func (s *Store) GetAuthInfo(provider string) (*config.AuthInfo, error) {
	key := fmt.Sprintf("%s-auth", provider)
	data, err := keyring.Get(s.serviceName, key)
	if err != nil {
		if err == keyring.ErrNotFound {
			return nil, nil // No auth info found, not an error
		}
		return nil, fmt.Errorf("failed to get auth info from keyring: %w", err)
	}
	
	var authInfo config.AuthInfo
	if err := json.Unmarshal([]byte(data), &authInfo); err != nil {
		return nil, fmt.Errorf("failed to unmarshal auth info: %w", err)
	}
	
	return &authInfo, nil
}

// DeleteAuthInfo removes authentication information for a provider
func (s *Store) DeleteAuthInfo(provider string) error {
	key := fmt.Sprintf("%s-auth", provider)
	if err := keyring.Delete(s.serviceName, key); err != nil {
		if err == keyring.ErrNotFound {
			return nil // Already deleted, not an error
		}
		return fmt.Errorf("failed to delete auth info from keyring: %w", err)
	}
	
	return nil
}

// IsAuthenticated checks if the user is authenticated with a provider
func (s *Store) IsAuthenticated(provider string) (bool, error) {
	authInfo, err := s.GetAuthInfo(provider)
	if err != nil {
		return false, err
	}
	
	return authInfo != nil && authInfo.AccessToken != "", nil
}

// StoreGenericSecret stores a generic secret for a provider with a specific key
func (s *Store) StoreGenericSecret(provider, key, value string) error {
	keyName := fmt.Sprintf("%s-%s", provider, key)
	if err := keyring.Set(s.serviceName, keyName, value); err != nil {
		return fmt.Errorf("failed to store secret in keyring: %w", err)
	}
	
	return nil
}

// GetGenericSecret retrieves a generic secret for a provider with a specific key
func (s *Store) GetGenericSecret(provider, key string) (string, error) {
	keyName := fmt.Sprintf("%s-%s", provider, key)
	value, err := keyring.Get(s.serviceName, keyName)
	if err != nil {
		if err == keyring.ErrNotFound {
			return "", nil // Secret not found, not an error
		}
		return "", fmt.Errorf("failed to get secret from keyring: %w", err)
	}
	
	return value, nil
}

// DeleteGenericSecret removes a generic secret for a provider with a specific key
func (s *Store) DeleteGenericSecret(provider, key string) error {
	keyName := fmt.Sprintf("%s-%s", provider, key)
	if err := keyring.Delete(s.serviceName, keyName); err != nil {
		if err == keyring.ErrNotFound {
			return nil // Already deleted, not an error
		}
		return fmt.Errorf("failed to delete secret from keyring: %w", err)
	}
	
	return nil
}

// ListProviders returns a list of providers that have stored authentication info
func (s *Store) ListProviders() ([]string, error) {
	// Note: go-keyring doesn't provide a way to list keys, so this is a limitation.
	// For now, we'll return known providers that we check for auth info.
	// In a real implementation, you might want to maintain a list in the config.
	providers := []string{"enkryptify"}
	var authenticatedProviders []string
	
	for _, provider := range providers {
		authenticated, err := s.IsAuthenticated(provider)
		if err != nil {
			continue // Skip on error
		}
		if authenticated {
			authenticatedProviders = append(authenticatedProviders, provider)
		}
	}
	
	return authenticatedProviders, nil
}

// ClearAll removes all stored secrets (use with caution)
func (s *Store) ClearAll() error {
	providers := []string{"enkryptify"} // Known providers
	
	for _, provider := range providers {
		// Try to delete auth info
		if err := s.DeleteAuthInfo(provider); err != nil {
			// Log error but continue with other providers
			fmt.Printf("Warning: failed to delete auth info for %s: %v\n", provider, err)
		}
	}
	
	return nil
}
