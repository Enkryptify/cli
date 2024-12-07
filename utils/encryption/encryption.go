package encryption

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"golang.org/x/crypto/nacl/box"
)

const (
	publicKeySize  = 32
	privateKeySize = 32
	nonceSize      = 24
	gcmNonceSize   = 12
	gcmTagSize     = 16
)

type EncryptedKey struct {
	Key   string `json:"key"`
	Nonce string `json:"nonce"`
}

type KeyPair struct {
	PublicKey  []byte
	PrivateKey []byte
}

type Decryptor struct {
	privateKey []byte
	publicKey  []byte
}

type encryptedData struct {
	IV      string `json:"iv"`
	Data    string `json:"encrypted"`
	AuthTag string `json:"authTag"`
}

func NewDecryptor(privateKey [32]byte, publicKeyB64 string) (*Decryptor, error) {
	publicKey, err := base64.StdEncoding.DecodeString(publicKeyB64)
	if err != nil {
		return nil, fmt.Errorf("invalid public key: %w", err)
	}

	if len(publicKey) != publicKeySize {
		return nil, fmt.Errorf("invalid public key size: expected %d, got %d", publicKeySize, len(publicKey))
	}

	return &Decryptor{
		privateKey: privateKey[:],
		publicKey:  publicKey,
	}, nil
}

func (d *Decryptor) Decrypt(encodedKey string) (string, error) {
	jsonBytes, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64 key: %w", err)
	}

	var encKey EncryptedKey
	if err := json.Unmarshal(jsonBytes, &encKey); err != nil {
		return "", fmt.Errorf("failed to parse key JSON: %w", err)
	}

	encrypted, err := base64.StdEncoding.DecodeString(encKey.Key)
	if err != nil {
		return "", fmt.Errorf("failed to decode encrypted key: %w", err)
	}

	nonceBytes, err := base64.StdEncoding.DecodeString(encKey.Nonce)
	if err != nil {
		return "", fmt.Errorf("failed to decode nonce: %w", err)
	}

	if len(nonceBytes) != nonceSize {
		return "", fmt.Errorf("invalid nonce size: expected %d, got %d", nonceSize, len(nonceBytes))
	}

	var nonce [nonceSize]byte
	var publicKey [publicKeySize]byte
	var privateKey [privateKeySize]byte

	copy(nonce[:], nonceBytes)
	copy(publicKey[:], d.publicKey)
	copy(privateKey[:], d.privateKey)

	decrypted, ok := box.Open(nil, encrypted, &nonce, &publicKey, &privateKey)
	if !ok {
		return "", fmt.Errorf("decryption failed")
	}

	return string(decrypted), nil
}

func DecryptSecretValue(encryptedValue string, key []byte) (string, error) {
	jsonBytes, err := base64.StdEncoding.DecodeString(encryptedValue)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	var data encryptedData
	if err := json.Unmarshal(jsonBytes, &data); err != nil {
		return "", fmt.Errorf("failed to parse JSON: %w", err)
	}

	iv, err := hex.DecodeString(data.IV)
	if err != nil {
		return "", fmt.Errorf("failed to decode IV: %w", err)
	}

	encrypted, err := hex.DecodeString(data.Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode encrypted data: %w", err)
	}

	authTag, err := hex.DecodeString(data.AuthTag)
	if err != nil {
		return "", fmt.Errorf("failed to decode auth tag: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	ciphertext := append(encrypted, authTag...)

	plaintext, err := aesGCM.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}
