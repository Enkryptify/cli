#!/usr/bin/env bash
set -euo pipefail

REPO="Enkryptify/cli"
BIN_NAME="ek"
INSTALL_DIR="/usr/local/bin"
VERSION="v0.2.0-test"

echo "🔍 Detecting system..."

OS="$(uname -s)"
ARCH="$(uname -m)"

# --- OS detection ---
case "$OS" in
  Linux)
    PLATFORM="Linux"
    BASH_COMPLETION_DIR="/etc/bash_completion.d"
    ZSH_COMPLETION_DIR="/usr/share/zsh/site-functions"
    ;;
  Darwin)
    PLATFORM="Darwin"
    BASH_COMPLETION_DIR="/usr/local/etc/bash_completion.d"
    ZSH_COMPLETION_DIR="/usr/local/share/zsh/site-functions"
    ;;
  *)
    echo "❌ Unsupported OS: $OS"
    exit 1
    ;;
esac

# --- Architecture detection ---
case "$ARCH" in
  x86_64|amd64)
    ARCH="x86_64"
    ;;
  aarch64|arm64)
    ARCH="arm64"
    ;;
  *)
    echo "❌ Unsupported CPU architecture: $ARCH"
    exit 1
    ;;
esac

echo "📦 Installing ek for $PLATFORM ($ARCH)"
echo "🔖 Version: $VERSION"

TARBALL="enkryptify_${PLATFORM}_${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$VERSION/$TARBALL"

echo "⬇️ Downloading $URL"

TMP_DIR="$(mktemp -d)"
cd "$TMP_DIR"

curl -fsSL "$URL" -o "$TARBALL"

echo "📦 Extracting archive"
tar -xzf "$TARBALL"

echo "🚀 Installing ek to $INSTALL_DIR"
sudo install -m 755 ek "$INSTALL_DIR/ek"

echo "🔧 Installing shell completions"

# --- Bash completion ---
if [ -f "ek.bash" ]; then
  sudo mkdir -p "$BASH_COMPLETION_DIR"
  sudo install -m 644 ek.bash "$BASH_COMPLETION_DIR/ek"
  echo "✔ Bash completion installed"
fi

# --- Zsh completion ---
if [ -f "ek.zsh" ]; then
  sudo mkdir -p "$ZSH_COMPLETION_DIR"
  sudo install -m 644 ek.zsh "$ZSH_COMPLETION_DIR/_ek"
  echo "✔ Zsh completion installed"
fi

echo
echo "✅ Enkryptify CLI installed successfully!"
echo
echo "👉 Restart your shell or run:"
echo "   exec \$SHELL"
echo
echo "Try:"
echo "   ek --help"
