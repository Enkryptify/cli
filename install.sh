#!/usr/bin/env bash
set -euo pipefail

REPO="Enkryptify/cli"
INSTALL_DIR="/usr/local/bin"

# Check if bash is available (required for this script)
if ! command -v bash &> /dev/null; then
    echo "❌ bash is required but not installed."
    echo "   Please install bash first:"
    echo "   - Debian/Ubuntu: sudo apt-get install bash"
    echo "   - Alpine: sudo apk add bash"
    echo "   - RedHat/CentOS: sudo yum install bash"
    echo "   - Arch: sudo pacman -S bash"
    exit 1
fi

# Check if required tools are available
if ! command -v curl &> /dev/null; then
    echo "❌ curl is required but not installed."
    echo "   Please install curl first."
    exit 1
fi

if ! command -v tar &> /dev/null; then
    echo "❌ tar is required but not installed."
    echo "   Please install tar first."
    exit 1
fi

# Get version from argument or use latest
if [ $# -gt 0 ]; then
  VERSION="$1"
  # Add 'v' prefix if not present
  if [[ ! "$VERSION" =~ ^v ]]; then
    VERSION="v$VERSION"
  fi
  echo "📌 Using specified version: $VERSION"
else
  # Try to get latest release tag from GitHub (includes prereleases)
  echo "🔍 Fetching latest version..."
  # First try latest release (stable)
  VERSION=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || echo "")
  
  # If no stable release, try to get latest prerelease
  if [ -z "$VERSION" ]; then
    echo "⚠️  No stable release found, checking for prereleases..."
    VERSION=$(curl -s "https://api.github.com/repos/$REPO/releases" 2>/dev/null | grep '"tag_name":' | head -n 1 | sed -E 's/.*"([^"]+)".*/\1/' || echo "")
  fi
  
  if [ -z "$VERSION" ]; then
    echo "❌ Could not fetch latest version from GitHub."
    echo "   Please specify a version manually: $0 v0.2.0"
    exit 1
  fi
  echo "📌 Using latest version: $VERSION"
fi

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
    echo "   This script supports Linux and macOS (Darwin) only."
    echo "   For Windows, please use Scoop or the PowerShell installer."
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
    echo "   Supported architectures: x86_64 (amd64), arm64 (aarch64)"
    echo "   Please install manually or open an issue to request support for $ARCH"
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
