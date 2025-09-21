package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/mitchellh/go-homedir"
)

type SetupConfig struct {
	Path          string `json:"path"`
	WorkspaceSlug string `json:"workspace_slug"`
	ProjectSlug   string `json:"project_slug"`
	EnvironmentID string `json:"environment_id"`
}

type SetupStorage struct {
	Setups []SetupConfig `json:"setups"`
}

func GetSetupConfigPath() (string, error) {
	home, err := homedir.Dir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	return filepath.Join(home, ".enkryptify", "config.json"), nil
}

func LoadSetupStorage() (*SetupStorage, error) {
	configPath, err := GetSetupConfigPath()
	if err != nil {
		return nil, err
	}

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return &SetupStorage{
			Setups: []SetupConfig{},
		}, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read setup config file: %w", err)
	}

	var storage SetupStorage
	if err := json.Unmarshal(data, &storage); err != nil {
		return nil, fmt.Errorf("failed to parse setup config file: %w", err)
	}

	if storage.Setups == nil {
		storage.Setups = []SetupConfig{}
	}

	return &storage, nil
}

func (s *SetupStorage) Save() error {
	configPath, err := GetSetupConfigPath()
	if err != nil {
		return err
	}

	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal setup config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write setup config file: %w", err)
	}

	return nil
}

func (s *SetupStorage) HasSetupForPath(path string) bool {
	for _, setup := range s.Setups {
		if setup.Path == path {
			return true
		}
	}
	return false
}

func (s *SetupStorage) AddOrUpdateSetup(setup SetupConfig) {
	for i, existingSetup := range s.Setups {
		if existingSetup.Path == setup.Path {
			s.Setups[i] = setup
			return
		}
	}
	s.Setups = append(s.Setups, setup)
}

func (s *SetupStorage) GetSetupForPath(path string) *SetupConfig {
	for _, setup := range s.Setups {
		if setup.Path == path {
			return &setup
		}
	}
	return nil
}

func GetCurrentWorkingDirectory() (string, error) {
	return os.Getwd()
}
