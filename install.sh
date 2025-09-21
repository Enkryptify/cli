#!/bin/bash

VERSION="0.1.7"
set -e

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

echo -e "${YELLOW}Downloading Enkryptify CLI ${VERSION} for ${OS} ${ARCH}...${NC}"

if ! TMPDIR=$(mktemp -d 2>/dev/null); then
    TMPDIR="/tmp/ek-$(date +%s)"
    mkdir -p "$TMPDIR"
fi

DOWNLOAD_URL="https://github.com/Enkryptify/cli/releases/download/v${VERSION}/enkryptify_${OS}_${ARCH}.tar.gz"

if command -v curl >/dev/null 2>&1; then
    curl -L "${DOWNLOAD_URL}" -o "${TMPDIR}/ek.tar.gz"
elif command -v wget >/dev/null 2>&1; then
    wget -O "${TMPDIR}/ek.tar.gz" "${DOWNLOAD_URL}"
else
    echo -e "${RED}Error: Neither curl nor wget found. Please install either curl or wget.${NC}"
    rm -rf "${TMPDIR}"
    exit 1
fi

echo -e "${YELLOW}Installing Enkryptify CLI...${NC}"
tar xzf "${TMPDIR}/ek.tar.gz" -C "${TMPDIR}"

INSTALL_DIR="/usr/local/bin"
if [ "$OS" = "Darwin" ]; then
    # Check if /usr/local/bin exists and is writable
    if [ ! -w "/usr/local/bin" ]; then
        INSTALL_DIR="$HOME/bin"
        mkdir -p "$INSTALL_DIR"
    fi
fi

if [ -w "$INSTALL_DIR" ]; then
    install -m 755 "${TMPDIR}/ek" "$INSTALL_DIR/ek"
else
    sudo install -m 755 "${TMPDIR}/ek" "$INSTALL_DIR/ek"
fi

rm -rf "${TMPDIR}"
if command -v ek >/dev/null 2>&1; then
    echo -e "${GREEN}Enkryptify CLI installed successfully!${NC}"
    ek --version
else
    if [ "$INSTALL_DIR" = "$HOME/bin" ]; then
        echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$HOME/.profile"
        echo -e "${YELLOW}Please run 'source ~/.profile' or start a new terminal session${NC}"
    fi
    echo -e "${RED}Installation completed but CLI not found in PATH${NC}"
    exit 1
fi