package keys

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"github.com/zalando/go-keyring"
)

const (
	keyringService = "enkryptify-cli"
	keyringUser    = "default"
)

func SaveAPIKey(apiKey string) error {
	return keyring.Set(keyringService, keyringUser, apiKey)
}

func GetAPIKey() (string, error) {
	return keyring.Get(keyringService, keyringUser)
}

func DeleteAPIKey() error {
	return keyring.Delete(keyringService, keyringUser)
}

func APIKeyIsValid(apiKey string) bool {
	parts := strings.Split(apiKey, "_")
	if len(parts) != 2 {
		return false
	} else if parts[0] != "ek" {
		return false
	} else if len(parts[1]) != 32 {
		return false
	}

	key := parts[1][:len(parts[1])-6]
	hash := parts[1][len(parts[1])-6:]

	hash_bytes := sha256.Sum256([]byte(key))
	hash_str := hex.EncodeToString(hash_bytes[:])

	if hash != hash_str[:6] {
		return false
	}

	return true
}
