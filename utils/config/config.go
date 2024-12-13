package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/mitchellh/go-homedir"
	"github.com/zalando/go-keyring"
)

const (
	envTokenPrefix      = "ENKRYPTIFY_TOKEN_"
	envProjectKeyPrefix = "ENKRYPTIFY_PROJECT_KEY_"
)

type Config struct {
	ProjectID     int64  `json:"project_id"`
	EnvironmentID int64  `json:"environment_id"`
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

func sanitizePath(path string) string {
	invalid := []string{"/", "\\", ":", " ", "-"}
	result := path
	for _, char := range invalid {
		result = strings.ReplaceAll(result, char, "_")
	}
	return result
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

func (cm *ConfigManager) SetConfig(config Config, token string, projectKey string) error {
	absPath, err := filepath.Abs(config.DirectoryPath)
	if err != nil {
		return err
	}
	config.DirectoryPath = absPath

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

	if err := cm.save(); err != nil {
		return err
	}

	if err := keyring.Set(servicePrefix+"-project-key-"+absPath, "ek-cli", projectKey); err != nil {
		os.Setenv(envProjectKeyPrefix+sanitizePath(absPath), projectKey)
	}
	if err := keyring.Set(servicePrefix+"-token-"+absPath, "ek-cli", token); err != nil {
		os.Setenv(envTokenPrefix+sanitizePath(absPath), token)
	}
	return nil
}

func (cm *ConfigManager) GetConfig(dirPath string) (*Config, string, string, error) {
	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		return nil, "", "", err
	}

	for _, cfg := range cm.configs {
		if cfg.DirectoryPath == absPath {
			token, tokenErr := keyring.Get(servicePrefix+"-token-"+absPath, "ek-cli")
			projectKey, projectKeyErr := keyring.Get(servicePrefix+"-project-key-"+absPath, "ek-cli")

			if tokenErr != nil {
				token = os.Getenv(envTokenPrefix + sanitizePath(absPath))
			}
			if projectKeyErr != nil {
				projectKey = os.Getenv(envProjectKeyPrefix + sanitizePath(absPath))
			}

			if token == "" || projectKey == "" {
				return nil, "", "", os.ErrNotExist
			}

			return &cfg, token, projectKey, nil
		}
	}

	return nil, "", "", os.ErrNotExist
}

func (cm *ConfigManager) DeleteConfig(dirPath string) error {
	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		return err
	}

	for i, cfg := range cm.configs {
		if cfg.DirectoryPath == absPath {
			cm.configs = append(cm.configs[:i], cm.configs[i+1:]...)
			break
		}
	}

	if err := cm.save(); err != nil {
		return err
	} else if err := keyring.Delete(servicePrefix+"-project-key-"+absPath, "ek-cli"); err != nil {
		return err
	}

	return keyring.Delete(servicePrefix+"-token-"+absPath, "ek-cli")
}
