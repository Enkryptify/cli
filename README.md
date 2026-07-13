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

## Docker and dev containers

`ek login` uses a device verification URL, so the browser can run on your host while the CLI runs in a container. If the URL cannot open automatically, open the printed URL and approve the matching code.

The CLI uses the OS keyring when available and otherwise stores credentials in `~/.enkryptify/secure-store.json` with owner-only permissions. Mount `~/.enkryptify` into the container to preserve login and configuration between rebuilds, or set `ENKRYPTIFY_STORE_PATH` to a mounted file path.

## Documentation

For usage guides, command reference, and configuration: **[docs.enkryptify.com](https://docs.enkryptify.com)**

## License

[MIT](LICENSE)
