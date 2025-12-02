# TypeScript CLI Architecture - Summary

A concise overview of the TypeScript CLI architecture, explaining what each file does and its key methods.

---

## Architecture Overview

The CLI uses a **provider-based architecture** where:

- **Commands** (`login`, `setup`, `run`, `secret`) coordinate flows but delegate to providers
- **Providers** implement a common interface but handle their own logic
- **Config** manages two types: global auth status and local project configs
- **Storage** handles secure token storage via OS keyring
- **Inject** converts secrets to environment variables and runs commands

**Key Principle**: Commands don't know provider-specific details. They delegate to providers via interfaces.

---

## File Structure

```
src/
├── cmd/              # CLI command handlers
├── providers/        # Provider implementations
│   ├── base/        # Interfaces
│   ├── registry/    # Provider registry
│   └── enkryptify/  # Enkryptify provider
├── lib/             # Shared utilities
│   ├── config.ts    # All config management (auth + project)
│   ├── inject.ts    # Secret injection
│   └── keyring.ts   # Secure keyring storage
└── ui/              # Ink UI components
```

---

## Files Explained

### 1. `src/cmd/login.ts`

**Purpose**: Handles `ek login [provider]` command

**Key Method**:

```typescript
async function runLogin(
  providerName?: string,
  options?: LoginOptions // { force?: boolean }
): Promise<void> {
  // 1. Determine which provider to use
  // 2. Get provider from registry
  // 3. Call provider.login(options) - DELEGATE TO PROVIDER!
  // 4. Update auth config after successful login
}
```

**`--force` flag**: When `options.force === true`, skip the "already authenticated" check and force a new login.

---

### 2. `src/cmd/setup.ts`

**Purpose**: Handles `ek setup [provider]` command

**Key Method**:

```typescript
async function runSetup(providerName?: string): Promise<void> {
  // 1. Determine provider
  // 2. Get current directory
  // 3. Check if setup already exists (ask to overwrite)
  // 4. Get provider from registry
  // 5. Call provider.setup() - DELEGATE TO PROVIDER!
  // 6. Save to local project config
}
```

---

### 3. `src/cmd/run.ts`

**Purpose**: Handles `ek run -- <command>` command

**Key Method**:

```typescript
async function runRun(
  command: string[],
  options?: { env?: string }
): Promise<void> {
  // 1. Get current directory
  // 2. Find local project config
  // 3. Apply temporary overrides (if --env flag)
  // 4. Get provider from registry
  // 5. Call provider.run() - DELEGATE TO PROVIDER!
  // 6. Inject secrets and execute command
}
```

**Temporary Overrides**: Supports `--env <name>` flag to temporarily override environment. Override exists only in memory - config file never changes.

---

### 4. `src/cmd/secret.ts`

**Purpose**: Handles `ek secret <action> <key> [value]` commands

**Key Method**:

```typescript
async function runSecret(
  action: "get" | "add" | "update" | "del" | "list",
  key?: string,
  value?: string,
  options?: { showValues?: boolean }
): Promise<void> {
  // 1. Get current directory
  // 2. Find local project config
  // 3. Get provider from registry
  // 4. Delegate to provider based on action
}
```

---

### 5. `src/providers/base/Provider.ts`

**Purpose**: Defines the interface all providers must implement

```typescript
interface Provider {
  readonly name: string;
  login(options?: LoginOptions): Promise<void>;
  setup(options: SetupOptions): Promise<ProjectConfig>;
  run(config: ProviderConfig): Promise<Secret[]>;
  createSecret(
    config: ProviderConfig,
    name: string,
    value: string
  ): Promise<void>;
  updateSecret(
    config: ProviderConfig,
    name: string,
    value: string
  ): Promise<void>;
  deleteSecret(config: ProviderConfig, name: string): Promise<void>;
  listSecrets(config: ProviderConfig): Promise<Secret[]>;
}
```

**Key Points**:

- All methods check authentication internally
- Commands don't need to check auth - providers handle it
- Each provider knows how to interpret its own config structure

---

### 6. `src/providers/base/AuthProvider.ts` (Internal)

**Purpose**: Internal authentication helper interface (used internally by providers)

```typescript
interface AuthProvider {
  isAuthenticated(): Promise<boolean>;
  login(options?: LoginOptions): Promise<void>;
  logout(): Promise<void>;
  getCredentials(): Promise<Credentials>;
  verify(): Promise<boolean>;
}
```

---

### 7. `src/providers/registry/ProviderRegistry.ts`

**Purpose**: Central registry for all providers

**Key Methods**:

```typescript
class ProviderRegistry {
  register(provider: Provider): void;
  get(name: string): Provider | undefined;
  getDefault(): Provider | undefined;
  list(): Provider[];
  has(name: string): boolean;
}
```

---

### 8. `src/providers/enkryptify/EnkryptifyProvider.ts`

**Purpose**: Enkryptify provider implementation

**Key Methods**:

- `login()`: Handles OAuth flow, stores token in keyring
- `setup()`: Fetches workspaces/projects/environments, user selects via Ink UI
- `run()`: Fetches secrets from API, returns normalized Secret[]
- `createSecret()`, `updateSecret()`, `deleteSecret()`, `listSecrets()`: Secret management

**Internal Methods** (not in Provider interface):

- `getWorkspaces()`, `getProjects()`, `getEnvironments()`: Used by setup()

---

### 9. `src/providers/enkryptify/EnkryptifyAuth.ts` (Internal)

**Purpose**: Internal authentication helper for Enkryptify provider

**Key Methods**:

- `isAuthenticated()`: Checks keyring and environment variables
- `login()`: OAuth 2.0 PKCE flow, stores token in keyring
- `getCredentials()`: Gets token from keyring
- `verify()`: Verifies token is valid
- `logout()`: Deletes token from keyring

---

### 10. `src/lib/config.ts`

**Purpose**: All configuration management (auth + project configs)

**Key Functions**:

**Path Utilities**:

```typescript
getConfigDir(): string                    // ~/.enkryptify
getAuthConfigPath(): string               // ~/.enkryptify/auth.json
findProjectConfig(startPath: string): string | null  // Search up directory tree
getProjectConfigPath(dirPath: string): string        // dir/.enkryptify.json
```

**Auth Config Manager**:

```typescript
class AuthConfigManager {
  getDefaultProvider(): Promise<string | undefined>;
  setDefaultProvider(providerName: string): Promise<void>;
  markAuthenticated(providerName: string, metadata?: object): Promise<void>;
  getProviderMetadata(providerName: string): Promise<object | undefined>;
}
```

**Project Config Manager**:

```typescript
class ProjectConfigManager {
  findConfig(startPath: string): Promise<ProjectConfig | null>;
  save(dirPath: string, config: ProjectConfig): Promise<void>;
  hasConfig(dirPath: string): Promise<boolean>;
  remove(dirPath: string): Promise<void>;
}
```

**Exports**:

- `authConfig`: Singleton AuthConfigManager instance
- `projectConfig`: Singleton ProjectConfigManager instance

**Files**:

- `~/.enkryptify/auth.json`: Global auth config (default provider, metadata)
- `.enkryptify.json`: Local project config (per directory)

---

### 11. `src/lib/inject.ts`

**Purpose**: Secret injection and command execution

**Key Method**:

```typescript
class SecretInjector {
  async injectAndRun(
    secrets: Secret[],
    command: string[],
    options?: InjectOptions
  ): Promise<void> {
    // 1. Start with current environment
    // 2. Add secrets as environment variables
    // 3. Execute command with environment
    // 4. Wait for completion
  }
}
```

**Export**: `secretInjector`: Singleton SecretInjector instance

**Why it exists**: Encapsulates secret injection logic. Works for ALL providers (they all return normalized Secret[] format).

---

### 12. `src/lib/keyring.ts`

**Purpose**: Secure storage abstraction for tokens/credentials

**Key Methods**:

```typescript
class OSKeyring {
  async set(key: string, value: any): Promise<void>;
  async get(key: string): Promise<any | null>;
  async delete(key: string): Promise<void>;
  async has(key: string): Promise<boolean>;
}
```

**Export**: `keyring`: Singleton OSKeyring instance

**Storage Keys**:

- `enkryptify-auth`: Enkryptify token
- `aws-auth`: AWS credentials
- `gcp-auth`: GCP credentials

**Why it exists**: Tokens/credentials should NOT be in config files. OS keyring is secure and encrypted.

---

## Key Design Principles

### 1. Delegation Pattern

**Commands delegate to providers** because not all providers have the same structure:

- **Enkryptify**: Has workspaces → projects → environments
- **AWS**: Has regions → secret names (no hierarchy)
- **GCP**: Has projects → secret names (different structure)

Each provider handles its own setup flow internally.

### 2. Interface-Based Design

- All providers implement same interface
- Commands don't know about specific providers
- Commands delegate to providers via interface methods
- Easy to add new providers

### 3. Configuration Separation

**Two-file structure**:

- **Global auth config** (`~/.enkryptify/auth.json`): Default provider and metadata (shared across all projects)
- **Local project config** (`.enkryptify.json` in each directory): Project-specific settings
- **Keyring**: Actual tokens/credentials (secure storage)

**Benefits**:

- One login works for all projects
- Each directory can have different provider/config
- Simple and portable (config lives with project)
- Clear separation of concerns

### 4. Internal Auth Checks

Each provider method handles auth checks internally:

```typescript
async setup(options: SetupOptions): Promise<ProjectConfig> {
  // Auth check happens HERE - not in command!
  if (!(await this.auth.isAuthenticated())) {
    throw new Error("Not authenticated. Run 'ek login' first.");
  }
  // ... rest of setup logic
}
```

**Benefits**:

- Commands don't need to check auth - providers handle it
- No repetition - auth check is in one place (inside provider)
- Consistent error messages across all providers

---

## Complete Flow Example: `ek run -- npm start`

```
1. User types: ek run -- npm start
   ↓
2. run.ts gets current directory
   ↓
3. run.ts calls: projectConfig.findConfig(currentPath)
   ↓
4. lib/config.ts searches for .enkryptify.json (walks up directory tree)
   ↓
5. run.ts gets provider: providerRegistry.get("enkryptify")
   ↓
6. run.ts calls: provider.run(config)
   ↓
7. EnkryptifyProvider.run():
   - Checks authentication internally (throws if not authenticated)
   - Interprets config (reads workspace/project/environment)
   - Gets token from keyring
   - Makes API call
   - Returns normalized secrets: [{ name: "DATABASE_URL", value: "..." }]
   ↓
8. run.ts calls: secretInjector.injectAndRun(secrets, ["npm", "start"])
   ↓
9. lib/inject.ts:
   - Adds secrets to environment variables
   - Executes: npm start
   ↓
10. npm start runs with DATABASE_URL available!
```

---

## Adding a New Provider

To add AWS (or any provider):

1. **Create provider files**:

   - `providers/aws/AWSProvider.ts` (implements Provider interface)
   - `providers/aws/AWSAuth.ts` (implements AuthProvider interface)

2. **Implement required methods**:

   - `login()`, `setup()`, `run()`, `createSecret()`, `updateSecret()`, `deleteSecret()`, `listSecrets()`

3. **Register provider**:

   - `providerRegistry.register(new AWSProvider())`

4. **Done!** No changes needed to:
   - `cmd/login.ts`, `cmd/setup.ts`, `cmd/run.ts`, `cmd/secret.ts`
   - `lib/config.ts`, `lib/inject.ts`

**Why it works**:

- Commands delegate to providers via interfaces
- Each provider handles its own logic and auth checks internally
- Commands stay simple and don't need provider-specific knowledge

---

## File Responsibilities Summary

| File                                         | Responsibility               | Reads                           | Writes                          |
| -------------------------------------------- | ---------------------------- | ------------------------------- | ------------------------------- |
| `cmd/login.ts`                               | Coordinate login flow        | -                               | `auth.json`                     |
| `cmd/setup.ts`                               | Coordinate setup flow        | -                               | `.enkryptify.json`              |
| `cmd/run.ts`                                 | Coordinate run flow          | `.enkryptify.json`              | -                               |
| `cmd/secret.ts`                              | Coordinate secret management | `.enkryptify.json`              | -                               |
| `providers/registry/ProviderRegistry.ts`     | Provider lookup              | -                               | -                               |
| `providers/enkryptify/EnkryptifyProvider.ts` | Enkryptify logic             | Keyring                         | -                               |
| `providers/enkryptify/EnkryptifyAuth.ts`     | Enkryptify auth              | Keyring                         | Keyring                         |
| `lib/config.ts`                              | All config management        | `auth.json`, `.enkryptify.json` | `auth.json`, `.enkryptify.json` |
| `lib/inject.ts`                              | Secret injection             | -                               | -                               |
| `lib/keyring.ts`                             | Secure storage               | OS Keyring                      | OS Keyring                      |

---

This architecture is clean, extensible, and maintainable. Adding new providers or commands requires minimal changes to existing code.
