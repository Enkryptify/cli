package config

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/mitchellh/go-homedir"
	"github.com/zalando/go-keyring"
)

type Config struct {
	WorkspaceID   string `json:"workspace_id"`
	ProjectID     string `json:"project_id"`
	EnvironmentID string `json:"environment_id"`
	PublicKey     string `json:"public_key"`
	DirectoryPath string `json:"directory_path"`
}

const (
	servicePrefix = "enkryptify"
	configDir     = ".enkryptify"
	configFile    = "config.json"
)

type ConfigManager struct {
	configs    []Config
	configPath string
}

func NewConfigManager() (*ConfigManager, error) {
	home, err := homedir.Dir()
	if err != nil {
		return nil, err
	}

	configPath := filepath.Join(home, configDir, configFile)
	cm := &ConfigManager{
		configPath: configPath,
	}

	if err := cm.load(); err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
		cm.configs = make([]Config, 0)
	}

	return cm, nil
}

func (cm *ConfigManager) load() error {
	data, err := os.ReadFile(cm.configPath)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, &cm.configs)
}

func (cm *ConfigManager) save() error {
	dir := filepath.Dir(cm.configPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cm.configs, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(cm.configPath, data, 0600)
}

func (cm *ConfigManager) SetConfig(config Config, projectKey string) error {
	// Get absolute path
	absPath, err := filepath.Abs(config.DirectoryPath)
	if err != nil {
		return err
	}
	config.DirectoryPath = absPath

	// Update or add config
	found := false
	for i, cfg := range cm.configs {
		if cfg.DirectoryPath == config.DirectoryPath {
			cm.configs[i] = config
			found = true
			break
		}
	}

	if !found {
		cm.configs = append(cm.configs, config)
	}

	// Save config file
	if err := cm.save(); err != nil {
		return err
	}

	// Store project key in system keyring
	keyringService := servicePrefix + "-" + absPath
	return keyring.Set(keyringService, "project_key", projectKey)
}

func (cm *ConfigManager) GetConfig(dirPath string) (*Config, string, error) {
	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		return nil, "", err
	}

	// Find config for directory
	for _, cfg := range cm.configs {
		if cfg.DirectoryPath == absPath {
			// Get project key from system keyring
			keyringService := servicePrefix + "-" + absPath
			projectKey, err := keyring.Get(keyringService, "project_key")
			if err != nil {
				return nil, "", err
			}
			return &cfg, projectKey, nil
		}
	}

	return nil, "", os.ErrNotExist
}

func (cm *ConfigManager) DeleteConfig(dirPath string) error {
	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		return err
	}

	// Remove config
	for i, cfg := range cm.configs {
		if cfg.DirectoryPath == absPath {
			cm.configs = append(cm.configs[:i], cm.configs[i+1:]...)
			break
		}
	}

	// Save config file
	if err := cm.save(); err != nil {
		return err
	}

	// Remove project key from system keyring
	keyringService := servicePrefix + "-" + absPath
	return keyring.Delete(keyringService, "project_key")
}
