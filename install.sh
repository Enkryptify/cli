#!/usr/bin/env bash
set -euo pipefail

REPO="Enkryptify/cli"
BIN_NAME="ek"
INSTALL_DIR="/usr/local/bin"

echo "🔍 Detecting system..."

OS="$(uname -s)"
ARCH="$(uname -m)"

# --- OS check ---
if [ "$OS" != "Linux" ]; then
  echo "❌ This installer supports Linux only."
  exit 1
fi

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

echo "📦 Installing ek for Linux ($ARCH)"

# --- Fetch latest release tag ---
VERSION="$(curl -fsSL https://api.github.com/repos/$REPO/releases/latest | grep tag_name | cut -d '"' -f 4)"

if [ -z "$VERSION" ]; then
  echo "❌ Failed to determine latest version"
  exit 1
fi

TARBALL="enkryptify_Linux_${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$VERSION/$TARBALL"

echo "⬇️ Downloading $URL"

TMP_DIR="$(mktemp -d)"
cd "$TMP_DIR"

curl -fsSL "$URL" -o "$TARBALL"

echo "📦 Extracting archive"
tar -xzf "$TARBALL"

# --- Install binary ---
echo "🚀 Installing ek to $INSTALL_DIR"
sudo install -m 755 ek "$INSTALL_DIR/ek"

# --- Install completions ---
echo "🔧 Installing shell completions"

if [ -f "ek.bash" ]; then
  sudo install -m 644 ek.bash /etc/bash_completion.d/ek
  echo "✔ Bash completion installed"
fi

if [ -f "ek.zsh" ]; then
  sudo install -m 644 ek.zsh /usr/share/zsh/site-functions/_ek
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
