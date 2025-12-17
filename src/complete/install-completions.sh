#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Look for completions in the same directory as script, or in a completions subdirectory
if [ -d "$SCRIPT_DIR/completions" ]; then
  COMPLETIONS_DIR="$SCRIPT_DIR/completions"
else
  COMPLETIONS_DIR="$SCRIPT_DIR"
fi

# Detect shell
if [ -n "$ZSH_VERSION" ]; then
  SHELL_TYPE="zsh"
elif [ -n "$BASH_VERSION" ]; then
  SHELL_TYPE="bash"
else
  echo "Unsupported shell. Please install completions manually."
  exit 1
fi

# Install bash completion
if [ "$SHELL_TYPE" = "bash" ]; then
  # Try system-wide location first (requires sudo)
  if [ -d "/etc/bash_completion.d" ] && [ -w "/etc/bash_completion.d" ] || [ "$EUID" -eq 0 ]; then
    INSTALL_DIR="/etc/bash_completion.d"
    sudo cp "$COMPLETIONS_DIR/ek.bash" "$INSTALL_DIR/ek" 2>/dev/null || {
      # Fall back to user location
      USER_DIR="$HOME/.local/share/bash-completion/completions"
      mkdir -p "$USER_DIR"
      cp "$COMPLETIONS_DIR/ek.bash" "$USER_DIR/ek"
      echo "Bash completion installed to $USER_DIR/ek"
      echo "Note: You may need to restart your shell or run: source ~/.bashrc"
    } && echo "Bash completion installed to $INSTALL_DIR/ek"
  else
    # User location
    USER_DIR="$HOME/.local/share/bash-completion/completions"
    mkdir -p "$USER_DIR"
    cp "$COMPLETIONS_DIR/ek.bash" "$USER_DIR/ek"
    echo "Bash completion installed to $USER_DIR/ek"
    echo "Note: You may need to restart your shell or run: source ~/.bashrc"
  fi
fi

# Install zsh completion
if [ "$SHELL_TYPE" = "zsh" ]; then
  # Try system-wide location first
  if [ -d "/usr/local/share/zsh/site-functions" ] && [ -w "/usr/local/share/zsh/site-functions" ] || [ "$EUID" -eq 0 ]; then
    INSTALL_DIR="/usr/local/share/zsh/site-functions"
    sudo cp "$COMPLETIONS_DIR/ek.zsh" "$INSTALL_DIR/_ek" 2>/dev/null || {
      # Fall back to user location
      USER_DIR="$HOME/.local/share/zsh/site-functions"
      mkdir -p "$USER_DIR"
      cp "$COMPLETIONS_DIR/ek.zsh" "$USER_DIR/_ek"
      echo "Zsh completion installed to $USER_DIR/_ek"
      echo "Note: You may need to restart your shell or add to ~/.zshrc:"
      echo "  fpath=(\$HOME/.local/share/zsh/site-functions \$fpath)"
    } && echo "Zsh completion installed to $INSTALL_DIR/_ek"
  else
    # User location
    USER_DIR="$HOME/.local/share/zsh/site-functions"
    mkdir -p "$USER_DIR"
    cp "$COMPLETIONS_DIR/ek.zsh" "$USER_DIR/_ek"
    echo "Zsh completion installed to $USER_DIR/_ek"
    echo "Note: You may need to restart your shell or add to ~/.zshrc:"
    echo "  fpath=(\$HOME/.local/share/zsh/site-functions \$fpath)"
  fi
fi

echo "Completions installed successfully!"

