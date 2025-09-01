package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/mitchellh/go-homedir"
)

// Config represents the CLI configuration
type Config struct {
	DefaultProvider string            `json:"default_provider"`
	Providers       map[string]Provider `json:"providers"`
}

// Provider represents a secrets provider configuration
type Provider struct {
	Type     string                 `json:"type"`
	Settings map[string]interface{} `json:"settings"`
}

// AuthInfo represents authentication information
type AuthInfo struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresAt    int64  `json:"expires_at,omitempty"`
	UserID       string `json:"user_id,omitempty"`
	Email        string `json:"email,omitempty"`
}

const (
	ConfigFileName = ".enkryptify"
	ConfigDirName  = "enkryptify"
)

// GetConfigDir returns the configuration directory path
func GetConfigDir() (string, error) {
	home, err := homedir.Dir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	
	configDir := filepath.Join(home, ".config", ConfigDirName)
	return configDir, nil
}

// GetConfigPath returns the full path to the config file
func GetConfigPath() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	
	return filepath.Join(configDir, "config.json"), nil
}

// LoadConfig loads the configuration from disk
func LoadConfig() (*Config, error) {
	configPath, err := GetConfigPath()
	if err != nil {
		return nil, err
	}
	
	// Return default config if file doesn't exist
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return &Config{
			DefaultProvider: "enkryptify",
			Providers:       make(map[string]Provider),
		}, nil
	}
	
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}
	
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}
	
	// Initialize providers map if nil
	if config.Providers == nil {
		config.Providers = make(map[string]Provider)
	}
	
	return &config, nil
}

// SaveConfig saves the configuration to disk
func (c *Config) Save() error {
	configPath, err := GetConfigPath()
	if err != nil {
		return err
	}
	
	// Ensure config directory exists
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}
	
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}
	
	if err := os.WriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}
	
	return nil
}

// SetProvider sets the configuration for a specific provider
func (c *Config) SetProvider(name string, provider Provider) {
	c.Providers[name] = provider
}

// GetProvider gets the configuration for a specific provider
func (c *Config) GetProvider(name string) (Provider, bool) {
	provider, exists := c.Providers[name]
	return provider, exists
}

// SetDefaultProvider sets the default provider
func (c *Config) SetDefaultProvider(name string) {
	c.DefaultProvider = name
}
