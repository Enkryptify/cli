---
description: Enkryptify CLI - Project documentation and development guidelines
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json, *.md"
alwaysApply: true
---

# Enkryptify CLI - Project Documentation

This document provides comprehensive information about the Enkryptify CLI codebase, architecture, and development practices.

## Table of Contents

- [Project Overview](#project-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Development Setup](#development-setup)
- [Build & Release Process](#build--release-process)
- [Key Patterns & Conventions](#key-patterns--conventions)
- [Bun-Specific Guidelines](#bun-specific-guidelines)

---

## Project Overview

**Enkryptify CLI** is a command-line tool that securely manages and injects secrets from various secret management providers (Enkryptify, AWS Secrets Manager, GCP Secret Manager) directly into your commands and applications.

### Key Features

- **Multi-Provider Support**: Enkryptify, AWS Secrets Manager, GCP Secret Manager
- **Secure Storage**: Uses OS keyring (keytar) for credential storage
- **Interactive UI**: React-based CLI UI using Ink
- **Shell Completions**: Bash, Zsh, and PowerShell completion support
- **Cross-Platform**: Linux, macOS, Windows support
- **Automatic Secret Injection**: Run commands with secrets as environment variables

### Commands

- `ek login` - Authenticate with a provider
- `ek configure` - Configure project settings
- `ek run <command>` - Run a command with secrets injected
- `ek list` - List secrets
- `ek create <name> <value>` - Create a secret
- `ek update <name>` - Update a secret
- `ek delete <name>` - Delete a secret

---

## Technology Stack

### Core

- **Bun** (v1.3.5+) - Runtime, package manager, bundler
- **TypeScript** (5.9.3+) - Type safety
- **Commander.js** - CLI framework
- **Ink** - React-based CLI UI framework

### Key Dependencies

- **AWS SDK v3** - AWS Secrets Manager integration
- **Google Cloud SDK** - GCP Secret Manager integration
- **keytar** - Secure OS keyring storage
- **Zod** - Runtime validation
- **React** - UI components

### Development Tools

- **ESLint** - Linting
- **Prettier** - Code formatting
- **TypeScript** - Type checking

---

## Project Structure

```
src/
├── cli.ts                    # Main entry point
├── env.ts                    # Environment variable configuration
│
├── cmd/                      # CLI command handlers
│   ├── index.ts             # Command registry (registers all commands)
│   ├── login.ts             # Login command
│   ├── configure.ts         # Configure command
│   ├── run.ts               # Run command (secret injection)
│   ├── listCommand.ts       # List secrets command
│   ├── create.ts            # Create secret command
│   ├── update.ts            # Update secret command
│   └── delete.ts            # Delete secret command
│
├── providers/                # Secret management provider implementations
│   ├── base/                 # Base interfaces and types
│   │   ├── Provider.ts      # Provider interface
│   │   └── AuthProvider.ts  # Authentication interface
│   ├── registry/            # Provider registry pattern
│   │   ├── ProviderRegistry.ts
│   │   └── index.ts         # Provider registration
│   ├── enkryptify/          # Enkryptify provider
│   │   ├── provider.ts
│   │   ├── auth.ts
│   │   └── httpClient.ts
│   ├── aws/                 # AWS Secrets Manager provider
│   │   ├── provider.ts
│   │   └── auth.ts
│   └── gcp/                 # GCP Secret Manager provider
│       ├── provider.ts
│       ├── auth.ts
│       └── httpClient.ts
│
├── lib/                      # Shared utilities
│   ├── config.ts            # Configuration management (project + provider settings)
│   ├── inject.ts             # Secret injection logic (environment variable building)
│   ├── keyring.ts            # Secure keyring storage wrapper
│   ├── error.ts              # Error handling utilities
│   ├── input.ts              # User input helpers
│   ├── sharedHttpClient.ts   # Shared HTTP client factory
│   └── terminal.ts           # Terminal utilities
│
├── ui/                       # Ink-based React UI components
│   ├── LoginFlow.tsx         # Main login flow coordinator
│   ├── RunFlow.tsx           # Run command spinner/UI
│   ├── EnkryptifyLogin.tsx   # Enkryptify-specific login UI
│   ├── AwsLogin.tsx          # AWS-specific login UI
│   ├── GcpLogin.tsx          # GCP-specific login UI
│   ├── SecretsTable.tsx      # Table display for secrets
│   ├── SelectItem.tsx        # Selection UI component
│   ├── Confirm.tsx           # Confirmation dialog
│   └── SuccessMessage.tsx    # Success message display
│
└── complete/                 # Shell completion scripts
    ├── complete.ts           # Completion logic
    ├── ek.bash               # Bash completion script
    ├── ek.zsh                # Zsh completion script
    └── enkryptify-completion.psm1  # PowerShell completion module
```

---

## Architecture

### Core Concepts

#### 1. **Provider Pattern**

Providers implement the `Provider` interface and handle all interactions with secret management services:

```typescript
interface Provider {
    readonly name: string;
    login(options?: LoginOptions): Promise<void>;
    configure(options: string): Promise<ProjectConfig>;
    run(config: ProjectConfig, options?: runOptions): Promise<Secret[]>;
    createSecret(config: ProjectConfig, name: string, value: string): Promise<void>;
    updateSecret(config: ProjectConfig, name: string, isPersonal?: boolean): Promise<void>;
    deleteSecret(config: ProjectConfig, name: string): Promise<void>;
    listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]>;
}
```

#### 2. **Registry Pattern**

Providers are registered in a central registry and retrieved by name:

```typescript
// Registration (in src/providers/registry/index.ts)
providerRegistry.register(new EnkryptifyProvider());
providerRegistry.register(new AwsProvider());
providerRegistry.register(new GcpProvider());

// Usage (in commands)
const provider = providerRegistry.get(projectConfig.provider);
```

#### 3. **Configuration Management**

Two-level configuration system:

- **Provider-level**: Stored in `~/.enkryptify/config.json` under `providers` key
- **Project-level**: Stored in `~/.enkryptify/config.json` under `setups` key, keyed by project path

Project configuration is automatically discovered by walking up the directory tree.

#### 4. **Secret Injection**

Secrets are fetched from providers and injected as environment variables:

```typescript
// 1. Fetch secrets from provider
const secrets = await provider.run(projectConfig, { env: "production" });

// 2. Build environment with secrets
const env = buildEnvWithSecrets(secrets);

// 3. Spawn process with injected environment
Bun.spawn([command, ...args], { env });
```

**Security**: Protected environment variables (PATH, HOME, etc.) are never overridden.

#### 5. **Command Pattern**

All commands follow this structure:

```typescript
export async function commandFunction(...args): Promise<void> {
    // 1. Validate inputs
    // 2. Get project config (if needed)
    // 3. Get provider (if needed)
    // 4. Implement logic
}

export function registerCommand(program: Command) {
    program
        .command("command-name")
        .description("Description")
        .action(async (args, opts) => {
            try {
                await commandFunction(args, opts);
            } catch (error) {
                logError(error.message);
                process.exit(1);
            }
        });
}
```

---

## Development Setup

### Prerequisites

- **Bun** (latest version) - [Installation Guide](https://bun.sh/docs/installation)
- **Git**

### Setup Steps

1. **Clone the repository:**

    ```bash
    git clone https://github.com/Enkryptify/cli.git
    cd cli
    ```

2. **Install dependencies:**

    ```bash
    bun install
    ```

3. **Run the CLI locally:**

    ```bash
    bun run src/cli.ts --help
    ```

4. **Run linting:**

    ```bash
    bun run lint
    bun run lint:fix
    ```

5. **Format code:**
    ```bash
    bun run format
    bun run format:check
    ```

### TypeScript Configuration

- **Path aliases**: `@/*` maps to `src/*`
- **Strict mode**: Enabled with additional safety checks
- **Module resolution**: Bundler mode (for Bun)
- **JSX**: React JSX transform

### Environment Variables

Configured in `src/env.ts`:

- `API_BASE_URL` - Enkryptify API base URL (default: `https://api.enkryptify.com`)
- `APP_BASE_URL` - Enkryptify app URL (default: `https://app.enkryptify.com`)
- `GCP_RESOURCE_MANAGER_API` - GCP API URL
- `CLI_VERSION` - CLI version (from `package.json` or env)

---

## Build & Release Process

### Local Build

```bash
# Development build
bun run build

# Compile to binary (single platform)
bun run package
```

### Release Pipeline

The release process is automated via GitHub Actions (`.github/workflows/release.yml`).

#### Trigger

Pushing a tag matching `v*` pattern:

```bash
git tag v0.2.3
git push origin v0.2.3
```

#### Pipeline Steps

1. **Build Jobs** (parallel):
    - `build-linux`: Builds Linux binaries (x64, arm64)
    - `build-macos`: Builds macOS binaries (x64, arm64)
    - `build-windows`: Builds Windows binary (x64)

2. **Publish Job** (waits for all builds):
    - Downloads all artifacts
    - Creates SHA256 checksums (`checksums.txt`)
    - Publishes GitHub release with all files
    - Updates Homebrew Formula (`homebrew-enkryptify-test`)
    - Updates Scoop manifest (`scoop-enkryptify-test`)

#### Deterministic Builds

To ensure reproducible checksums:

- **Linux**: `tar --mtime='2020-01-01 00:00:00' --owner=0 --group=0`
- **macOS**: `touch -t 202001010000` + `COPYFILE_DISABLE=1 tar`
- **Windows**: Fixed timestamps via PowerShell `Get-Date` + `Compress-Archive -CompressionLevel Optimal`

#### Checksums

Critical for security and integrity:

- Generated for all archives (`.tar.gz`, `.zip`)
- Format: `SHA256  filename` (two spaces)
- Sorted alphabetically
- Used by Homebrew and Scoop for verification

#### Package Manager Updates

- **Homebrew**: Formula updated with new version, URLs, and SHA256 checksums
- **Scoop**: Manifest updated with new version, URL, and hash
- **install.sh**: Automatically fetches latest from GitHub releases API

---

## Key Patterns & Conventions

### File Naming

- **Files**: `camelCase.ts` (e.g., `listCommand.ts`, `run.ts`)
- **Directories**: `camelCase` (e.g., `cmd/`, `lib/`)
- **Classes**: `PascalCase` (e.g., `EnkryptifyProvider`)
- **Functions**: `camelCase` (e.g., `registerLoginCommand`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`)

### TypeScript Guidelines

- **Strict mode**: Always enabled
- **Type over interface**: Prefer `type` for object shapes
- **Path aliases**: Always use `@/` for imports
- **No `any`**: Use `unknown` if type is truly unknown
- **Explicit types**: All function parameters and returns typed

### Error Handling

- Use `logError()` from `src/lib/error.ts` for user-facing errors
- Throw descriptive errors with context
- Always handle async errors with try/catch
- Exit codes: `process.exit(1)` for errors, `process.exit(0)` for success

### Security

- **Never log secrets or credentials**
- Use `keyring` from `src/lib/keyring.ts` for secure storage
- Validate all user inputs
- Protected environment variables are never overridden (see `src/lib/inject.ts`)

### UI Components (Ink)

- Use React hooks (`useState`, `useEffect`)
- Render to `process.stderr` for interactive UI
- Use `ink-spinner` for loading states
- Unmount components when done to prevent re-renders

---

## Bun-Specific Guidelines

### Default to Bun

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads `.env`, so don't use `dotenv`

### Bun APIs

- `Bun.serve()` - HTTP server (supports WebSockets, HTTPS, routes)
- `Bun.spawn()` - Process spawning (used for `ek run` command)
- `Bun.file()` - File operations (prefer over `node:fs`)
- `bun:sqlite` - SQLite (don't use `better-sqlite3`)
- `Bun.redis` - Redis (don't use `ioredis`)
- `Bun.sql` - Postgres (don't use `pg` or `postgres.js`)
- `WebSocket` - Built-in (don't use `ws`)
- `Bun.$` - Shell commands (instead of `execa`)

### Build Commands

- **Compile**: `bun build src/cli.ts --compile --target=bun-<platform>-<arch> --outfile=dist/bin/ek`
- **Bundle**: `bun build src/cli.ts --outdir dist --target node --minify`
- **Targets**: `bun-linux-x64`, `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`, `bun-windows-x64`

### Testing

Use `bun test`:

```typescript
import { test, expect } from "bun:test";

test("hello world", () => {
    expect(1).toBe(1);
});
```

---

## Adding New Features

### Adding a Provider

See `CONTRIBUTING.md` for detailed instructions. Summary:

1. Create provider directory: `src/providers/<name>/`
2. Implement `auth.ts` (required)
3. Implement `provider.ts` (required)
4. Create `httpClient.ts` (optional)
5. Register in `src/providers/registry/index.ts`
6. Create login UI component in `src/ui/`
7. Add to `LoginFlow.tsx`

### Adding a Command

1. Create command file: `src/cmd/<command>.ts`
2. Implement command function and registration
3. Register in `src/cmd/index.ts`
4. Test: `bun run src/cli.ts <command> --help`

### Adding UI Components

1. Create component in `src/ui/`
2. Use Ink/React patterns
3. Render to `process.stderr` for interactive UI
4. Handle cleanup (unmount) properly

---

## Important Notes

### Configuration Storage

- **Location**: `~/.enkryptify/config.json`
- **Structure**: `{ setups: {}, providers: {} }`
- **Security**: Credentials stored in OS keyring, not in config file

### Secret Injection Safety

Protected environment variables (from `src/lib/inject.ts`):

- `PATH`, `PATHEXT`
- `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`
- `PYTHONPATH`, `NODE_PATH`, `PERL5LIB`, etc.
- `IFS`, `CDPATH`, `ENV`, `BASH_ENV`, `SHELL`
- `HOME`, `USER`, `USERNAME`, `SUDO_*`

### Shell Completions

- **Bash**: `src/complete/ek.bash` → installed to `/etc/bash_completion.d/ek`
- **Zsh**: `src/complete/ek.zsh` → installed to `/usr/share/zsh/site-functions/_ek`
- **PowerShell**: `src/complete/enkryptify-completion.psm1` → Scoop auto-imports

### Release Process

1. Tag format: `v<major>.<minor>.<patch>` (e.g., `v0.2.3`)
2. Pipeline triggers automatically on tag push
3. All package managers updated automatically
4. `install.sh` fetches latest from GitHub releases API

---

## Resources

- **Bun Documentation**: https://bun.sh/docs
- **Ink Documentation**: https://github.com/vadimdemedes/ink
- **Commander.js**: https://github.com/tj/commander.js
- **Contributing Guide**: See `CONTRIBUTING.md`
- **README**: See `README.md` for user-facing documentation

---

For more information on specific topics, see:

- `CONTRIBUTING.md` - Detailed contribution guide
- `README.md` - User documentation
- `src/` - Source code with inline documentation
