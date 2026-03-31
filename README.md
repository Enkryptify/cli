# Enkryptify CLI

The official CLI for [Enkryptify](https://enkryptify.com) — manage and inject secrets into your development workflow.

## Install

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/Enkryptify/cli/main/install.sh | bash
```

**macOS (Homebrew):**

```bash
brew install enkryptify/enkryptify/enkryptify
```

**Windows (Scoop):**

```powershell
scoop bucket add enkryptify https://github.com/Enkryptify/scoop-enkryptify
scoop install enkryptify
```

## Quick start

```bash
ek login
ek configure
ek run -- your-command
```

## Documentation

For usage guides, command reference, and configuration: **[docs.enkryptify.com](https://docs.enkryptify.com)**

## License

[MIT](LICENSE)
