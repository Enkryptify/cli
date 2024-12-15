package config

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/zalando/go-keyring"
	"golang.org/x/crypto/pbkdf2"
)

const (
	salt = "701540ed9b5f9c34d73e96980dd82dc9"
	key  = "05c18c4ef3eb97ad3225aa3f03663122"
)

type CredentialStore interface {
	Set(service, username, secret string) error
	Get(service, username string) (string, error)
	Delete(service, username string) error
}

type KeyringStore struct{}

func (k *KeyringStore) Set(service, username, secret string) error {
	return keyring.Set(service, username, secret)
}

func (k *KeyringStore) Get(service, username string) (string, error) {
	return keyring.Get(service, username)
}

func (k *KeyringStore) Delete(service, username string) error {
	return keyring.Delete(service, username)
}

type FileStore struct {
	path string
	mu   sync.RWMutex
	data map[string]map[string]string
}

func NewFileStore(path string) (*FileStore, error) {
	fs := &FileStore{
		path: path,
		data: make(map[string]map[string]string),
	}

	if _, err := os.Stat(path); err == nil {
		if err := fs.load(); err != nil {
			return nil, err
		}
	}

	return fs, nil
}

func (f *FileStore) Set(service, username, secret string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.data[service] == nil {
		f.data[service] = make(map[string]string)
	}
	f.data[service][username] = secret
	return f.save()
}

func (f *FileStore) Get(service, username string) (string, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	if serviceData, ok := f.data[service]; ok {
		if secret, ok := serviceData[username]; ok {
			return secret, nil
		}
	}
	return "", os.ErrNotExist
}

func (f *FileStore) Delete(service, username string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if serviceData, ok := f.data[service]; ok {
		delete(serviceData, username)
		if len(serviceData) == 0 {
			delete(f.data, service)
		}
	}
	return f.save()
}

func deriveKey() ([]byte, error) {
	return pbkdf2.Key([]byte(key), []byte(salt), 4096, 32, sha256.New), nil
}

func (f *FileStore) save() error {
	key, err := deriveKey()
	if err != nil {
		return err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(f.path), 0700); err != nil {
		return err
	}

	plaintext, err := json.Marshal(f.data)
	if err != nil {
		return err
	}

	nonce := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}

	ciphertext := aesGCM.Seal(nonce, nonce, plaintext, nil)
	return os.WriteFile(f.path, ciphertext, 0600)
}

func (f *FileStore) load() error {
	key, err := deriveKey()
	if err != nil {
		return err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}

	ciphertext, err := os.ReadFile(f.path)
	if err != nil {
		return err
	}

	if len(ciphertext) < 12 {
		return fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:12], ciphertext[12:]

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}

	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return err
	}

	return json.Unmarshal(plaintext, &f.data)
}

func GetCredentialStore(configDir string) (CredentialStore, error) {
	if err := keyring.Set("test", "test", "test"); err == nil {
		keyring.Delete("test", "test")
		return &KeyringStore{}, nil
	}

	return NewFileStore(filepath.Join(configDir, "credentials.ek"))
}
