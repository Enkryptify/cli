#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Installing Enkryptify CLI...${NC}"

ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH="x86_64"
        ;;
    aarch64)
        ARCH="arm64"
        ;;
    armv7l)
        ARCH="armv7"
        ;;
    armv6l)
        ARCH="armv6"
        ;;
    i386|i686)
        ARCH="i386"
        ;;
    *)
        echo -e "${RED}Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

# Set version (currently hardcoded to 0.1.1)
VERSION="0.1.1"

echo -e "${YELLOW}Downloading Enkryptify CLI ${VERSION} for Linux ${ARCH}...${NC}"

TMPDIR=$(mktemp -d)
DOWNLOAD_URL="https://github.com/Enkryptify/cli/releases/download/v${VERSION}/enkryptify_Linux_${ARCH}.tar.gz"
curl -L "${DOWNLOAD_URL}" -o "${TMPDIR}/enkryptify.tar.gz"

echo -e "${YELLOW}Installing Enkryptify CLI...${NC}"
tar xzf "${TMPDIR}/enkryptify.tar.gz" -C "${TMPDIR}"
sudo install -m 755 "${TMPDIR}/enkryptify" /usr/local/bin/enkryptify
rm -rf "${TMPDIR}"

if command -v enkryptify &>/dev/null; then
    echo -e "${GREEN}Enkryptify CLI installed successfully!${NC}"
    enkryptify --version
else
    echo -e "${RED}Installation failed${NC}"
    exit 1
fi