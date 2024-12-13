#!/bin/bash

VERSION="0.1.0"
set -e

run_with_privileges() {
    if command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        "$@"
    fi
}

if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

OS="unknown"
case "$(uname -s)" in
    Linux*)     OS="Linux";;
    Darwin*)    OS="Darwin";;
    MINGW*|MSYS*|CYGWIN*) 
        OS="Windows"
        echo -e "${RED}Windows installation through this script is not supported.${NC}"
        echo "Please install the Windows CLI from: https://docs.enkryptify.com/integrations/cli/install"
        exit 1
        ;;
    *)
        echo -e "${RED}Unsupported operating system: $(uname -s)${NC}"
        exit 1
        ;;
esac

ARCH="unknown"
MACHINE=$(uname -m)
case $MACHINE in
    x86_64|amd64)  ARCH="x86_64";;
    aarch64)       ARCH="arm64";;
    armv7l)        ARCH="armv7";;
    armv6l)        ARCH="armv6";;
    i386|i686)     ARCH="i386";;
    *)
        echo -e "${RED}Unsupported architecture: $MACHINE${NC}"
        exit 1
        ;;
esac

if [ "$OS" = "Linux" ]; then
    # First, ensure we have sudo if needed
    if ! command -v sudo >/dev/null 2>&1; then
        if command -v apk >/dev/null 2>&1; then
            echo "Installing sudo..."
            su -c "apk add --no-cache sudo"
        fi
    fi

    # Detect package manager
    if command -v apt-get >/dev/null 2>&1; then
        echo "Installing dependencies using apt..."
        run_with_privileges apt-get update
        run_with_privileges apt-get install -y gnome-keyring libsecret-1-0 libsecret-1-dev dbus dbus-x11
    elif command -v dnf >/dev/null 2>&1; then
        echo "Installing dependencies using dnf..."
        run_with_privileges dnf install -y gnome-keyring libsecret libsecret-devel dbus dbus-x11
    elif command -v yum >/dev/null 2>&1; then
        echo "Installing dependencies using yum..."
        run_with_privileges yum install -y gnome-keyring libsecret libsecret-devel dbus dbus-x11
    elif command -v pacman >/dev/null 2>&1; then
        echo "Installing dependencies using pacman..."
        run_with_privileges pacman -Sy --noconfirm gnome-keyring libsecret dbus
    elif command -v apk >/dev/null 2>&1; then
        echo "Installing dependencies using apk..."
        run_with_privileges apk add --no-cache gnome-keyring libsecret libsecret-dev dbus dbus-x11
    else
        echo "Error: Unsupported package manager. Please install gnome-keyring and libsecret manually."
        exit 1
    fi

    # Initialize keyring if not already running
    if ! pidof gnome-keyring-daemon >/dev/null; then
        if command -v dbus-run-session >/dev/null 2>&1; then
            dbus-run-session -- gnome-keyring-daemon --start --components=secrets
        else
            # Fallback method if dbus-run-session is not available
            eval $(gnome-keyring-daemon --start --components=secrets)
            export GNOME_KEYRING_CONTROL
            export SSH_AUTH_SOCK
        fi
    fi
elif [ "$OS" = "Darwin" ]; then
    echo "macOS detected, skipping keyring installation (using native Keychain)"
else
    echo "Error: Unsupported operating system: $OS"
    exit 1
fi

echo -e "${YELLOW}Downloading Enkryptify CLI ${VERSION} for ${OS} ${ARCH}...${NC}"

if ! TMPDIR=$(mktemp -d 2>/dev/null); then
    TMPDIR="/tmp/enkryptify-$(date +%s)"
    mkdir -p "$TMPDIR"
fi

DOWNLOAD_URL="https://github.com/Enkryptify/cli/releases/download/v${VERSION}/enkryptify_${OS}_${ARCH}.tar.gz"

if command -v curl >/dev/null 2>&1; then
    curl -L "${DOWNLOAD_URL}" -o "${TMPDIR}/enkryptify.tar.gz"
elif command -v wget >/dev/null 2>&1; then
    wget -O "${TMPDIR}/enkryptify.tar.gz" "${DOWNLOAD_URL}"
else
    echo -e "${RED}Error: Neither curl nor wget found. Please install either curl or wget.${NC}"
    rm -rf "${TMPDIR}"
    exit 1
fi

echo -e "${YELLOW}Installing Enkryptify CLI...${NC}"
tar xzf "${TMPDIR}/enkryptify.tar.gz" -C "${TMPDIR}"

INSTALL_DIR="/usr/local/bin"
if [ "$OS" = "Darwin" ]; then
    # Check if /usr/local/bin exists and is writable
    if [ ! -w "/usr/local/bin" ]; then
        INSTALL_DIR="$HOME/bin"
        mkdir -p "$INSTALL_DIR"
    fi
fi

if [ -w "$INSTALL_DIR" ]; then
    install -m 755 "${TMPDIR}/enkryptify" "$INSTALL_DIR/enkryptify"
else
    sudo install -m 755 "${TMPDIR}/enkryptify" "$INSTALL_DIR/enkryptify"
fi

rm -rf "${TMPDIR}"
if command -v enkryptify >/dev/null 2>&1; then
    echo -e "${GREEN}Enkryptify CLI installed successfully!${NC}"
    enkryptify --version
else
    if [ "$INSTALL_DIR" = "$HOME/bin" ]; then
        echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$HOME/.profile"
        echo -e "${YELLOW}Please run 'source ~/.profile' or start a new terminal session${NC}"
    fi
    echo -e "${RED}Installation completed but CLI not found in PATH${NC}"
    exit 1
fi