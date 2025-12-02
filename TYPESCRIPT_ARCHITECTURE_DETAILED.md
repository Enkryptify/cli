# TypeScript CLI Architecture - Detailed Explanation

This document explains every file, every interaction, and every flow in the new TypeScript architecture for the Enkryptify CLI.

---

## Table of Contents

1. [File Structure Overview](#file-structure-overview)
2. [Core Files Explained](#core-files-explained)
3. [Provider System Explained](#provider-system-explained)
4. [Configuration System Explained](#configuration-system-explained)
5. [Complete Flow Examples](#complete-flow-examples)
6. [File Interactions](#file-interactions)
7. [Error Handling Flow](#error-handling-flow)
8. [Adding a New Provider](#adding-a-new-provider)

---

# File Structure Overview

```
src/
├── commands/                    # CLI command handlers
│   ├── login.ts                # Handles "ek login [provider]"
│   ├── setup.ts                # Handles "ek setup [provider]"
│   ├── run.ts                  # Handles "ek run -- <command>"
│   └── index.ts                # Command registration with CLI framework
│
├── providers/                  # Provider implementations
│   ├── base/                   # Base interfaces and types
│   │   ├── Provider.ts         # Provider interface definition
│   │   ├── AuthProvider.ts     # Authentication interface
│   │   └── types.ts            # Shared provider types
│   │
│   ├── registry/               # Provider registry system
│   │   └── ProviderRegistry.ts # Central provider registry
│   │
│   ├── enkryptify/            # Enkryptify provider implementation
│   │   ├── index.ts           # Provider registration and exports
│   │   ├── EnkryptifyProvider.ts # Main provider class
│   │   ├── EnkryptifyAuth.ts  # Enkryptify auth implementation
│   │   └── types.ts           # Enkryptify-specific types
│   │
│   ├── aws/                   # AWS Secrets Manager provider (example)
│   │   ├── index.ts
│   │   ├── AWSProvider.ts
│   │   ├── AWSAuth.ts
│   │   └── types.ts
│   │
│   └── index.ts                # Exports all providers
│
├── config/                     # Configuration management
│   ├── paths.ts                # Config file path utilities
│   ├── project.ts              # Project config manager
│   ├── auth.ts                 # Auth config manager
│   └── index.ts                # Config exports
│
├── storage/                    # Secure storage abstraction
│   ├── Keyring.ts              # Keyring wrapper (OS keyring)
│   └── types.ts                # Storage types
│
├── inject/                     # Secret injection
│   └── SecretInjector.ts      # Secret injection logic
│
├── utils/                      # Utilities
│   ├── logger.ts               # Logging utilities
│   └── errors.ts               # Error handling utilities
│
└── types/                      # Global TypeScript types
    └── index.ts                # Shared types across the app
```

---

# Core Files Explained

## 1. `src/commands/login.ts`

**Purpose**: Handles the `ek login [provider]` command

**Responsibilities**:

- Parse command arguments (provider name, flags like `--force`)
- Show UI messages (branding, progress, success/error)
- Coordinate the login flow
- Handle user cancellation (Ctrl+C)
- Update authentication status in config after successful login

**What it does NOT do**:

- Does NOT implement OAuth flow (delegates to provider)
- Does NOT store tokens (delegates to provider's auth)
- Does NOT know provider-specific details

**Key Functions**:

```typescript
async function runLogin(
  providerName?: string,
  options?: LoginOptions
): Promise<void> {
  // 1. Determine which provider to use
  //    - If providerName provided, use that
  //    - Otherwise, get default from auth config
  // 2. Get provider from registry
  //    - providerRegistry.get(providerName)
  // 3. Check if already authenticated (unless --force)
  //    - provider.auth.isAuthenticated()
  // 4. If authenticated and valid, show success and exit
  // 5. Otherwise, call provider.auth.login()
  //    - Provider handles its own OAuth/credential flow
  // 6. After successful login, update auth config
  //    - authConfig.markAuthenticated(providerName, settings)
}
```

**Dependencies**:

- `providers/registry/ProviderRegistry.ts` - To get provider instance
- `config/auth.ts` - To check/update auth status
- `utils/logger.ts` - For logging
- `utils/errors.ts` - For error handling

**Example Flow**:

```
User types: ek login enkryptify
  ↓
login.ts receives: providerName = "enkryptify"
  ↓
login.ts calls: providerRegistry.get("enkryptify")
  ↓
Registry returns: EnkryptifyProvider instance
  ↓
login.ts calls: provider.auth.isAuthenticated()
  ↓
EnkryptifyAuth checks: keyring for token
  ↓
If not authenticated:
  login.ts calls: provider.auth.login()
  ↓
EnkryptifyAuth does: OAuth flow (opens browser, etc.)
  ↓
After success:
  login.ts calls: authConfig.markAuthenticated("enkryptify", {...})
  ↓
Done!
```

---

## 2. `src/commands/setup.ts`

**Purpose**: Handles the `ek setup [provider]` command

**Responsibilities**:

- Parse command arguments (provider name)
- Get current working directory
- Load existing project configs
- Coordinate interactive setup flow
- Save project configuration

**What it does NOT do**:

- Does NOT fetch secrets (that's `run.ts`)
- Does NOT authenticate (assumes already logged in)
- Does NOT know provider-specific resource structures

**Key Functions**:

```typescript
async function runSetup(providerName?: string): Promise<void> {
  // 1. Validate authentication
  //    - Check if user is logged in to provider
  // 2. Determine provider
  //    - Get from argument or default
  // 3. Get current directory
  //    - process.cwd()
  // 4. Check if setup already exists
  //    - projectConfig.hasConfig(currentPath)
  //    - If exists, ask user to confirm overwrite
  // 5. Call provider.setup() - DELEGATE TO PROVIDER!
  //    - Provider handles its own setup flow:
  //      * Enkryptify: Fetches workspaces/projects/environments, user selects
  //      * AWS: Prompts for region and secretName manually
  //      * GCP: Prompts for project and secret name
  //      * Each provider knows best how to set itself up
  // 6. Provider returns ProjectConfig object
  //    - { path, provider, ...providerSpecificFields }
  // 7. Save to project config
  //    - projectConfig.save(config)
}
```

**Dependencies**:

- `providers/registry/ProviderRegistry.ts` - To get provider
- `config/project.ts` - To save project config
- `config/auth.ts` - To validate authentication
- `providers/base/Provider.ts` - For provider interface

**Example Flow**:

```
User types: ek setup enkryptify
  ↓
setup.ts receives: providerName = "enkryptify"
  ↓
setup.ts validates: user is authenticated (authConfig.isAuthenticated("enkryptify"))
  ↓
setup.ts gets: currentPath = "/Users/ali/my-app"
  ↓
setup.ts gets: provider = providerRegistry.get("enkryptify")
  ↓
setup.ts calls: provider.setup({ path: currentPath })
  ↓
EnkryptifyProvider.setup() handles its own flow:
  - Calls: provider.getWorkspaces() (internal)
  - Makes API call to get workspaces
  - Shows list to user
  - User selects: "my-workspace"
  - Calls: provider.getProjects("my-workspace") (internal)
  - User selects: "my-app"
  - Calls: provider.getEnvironments("my-workspace", "my-app") (internal)
  - User selects: "production"
  - Returns: ProjectConfig {
      path: "/Users/ali/my-app",
      provider: "enkryptify",
      workspace: "my-workspace",
      project: "my-app",
      environment: "production"
    }
  ↓
setup.ts receives: ProjectConfig from provider.setup()
  ↓
setup.ts saves: projectConfig.save(config)
  ↓
project.ts writes: to ~/.enkryptify/projects.json
  ↓
Done!
```

**Example Flow (AWS - Different Provider)**:

```
User types: ek setup aws
  ↓
setup.ts receives: providerName = "aws"
  ↓
setup.ts validates: user is authenticated (authConfig.isAuthenticated("aws"))
  ↓
setup.ts gets: currentPath = "/Users/ali/my-app"
  ↓
setup.ts gets: provider = providerRegistry.get("aws")
  ↓
setup.ts calls: provider.setup({ path: currentPath })
  ↓
AWSProvider.setup() handles its own flow:
  - Prompts user: "AWS Region:" (user enters: "us-east-1")
  - Prompts user: "Secret Name:" (user enters: "my-secrets")
  - Returns: ProjectConfig {
      path: "/Users/ali/my-app",
      provider: "aws",
      region: "us-east-1",
      secretName: "my-secrets"
    }
  ↓
setup.ts receives: ProjectConfig from provider.setup()
  ↓
setup.ts saves: projectConfig.save(config)
  ↓
Done!
```

---

## 3. `src/commands/run.ts`

**Purpose**: Handles the `ek run -- <command>` command

**Responsibilities**:

- Parse command arguments (everything after `--`)
- Get current working directory
- Find project config for directory
- Get provider from config
- Fetch secrets from provider
- Inject secrets as environment variables
- Execute user's command

**What it does NOT do**:

- Does NOT know how to fetch secrets (delegates to provider)
- Does NOT know provider-specific API details
- Does NOT know provider config structure (delegates to provider)
- Does NOT store secrets (only injects them)

**Key Point**: The `run` command already delegates properly! It calls `provider.getSecrets(projectConfig)`, and each provider knows how to interpret its own config structure:

- Enkryptify: Reads `workspace`, `project`, `environment` from config
- AWS: Reads `region`, `secretName` from config
- GCP: Reads `project`, `secretName` from config
- Each provider handles its own structure internally

**Key Functions**:

```typescript
async function runRun(command: string[], args: string[]): Promise<void> {
  // 1. Validate authentication
  //    - Check if user is logged in
  // 2. Get current directory
  //    - process.cwd()
  // 3. Load project config for directory
  //    - projectConfig.getForPath(currentPath)
  // 4. If no config found:
  //    - Show error: "Run 'ek setup' first"
  //    - Exit
  // 5. Get provider from config
  //    - providerRegistry.get(projectConfig.provider)
  // 6. Fetch secrets
  //    - provider.getSecrets(projectConfig)
  // 7. Inject secrets
  //    - secretInjector.inject(secrets, command)
  // 8. Execute command
  //    - Run command with secrets as env vars
}
```

**Dependencies**:

- `config/project.ts` - To get project config
- `providers/registry/ProviderRegistry.ts` - To get provider
- `inject/SecretInjector.ts` - To inject secrets
- `config/auth.ts` - To validate authentication

**Example Flow**:

```
User types: ek run -- npm start
  ↓
run.ts receives: command = ["npm", "start"]
  ↓
run.ts gets: currentPath = "/Users/ali/my-app"
  ↓
run.ts calls: projectConfig.getForPath("/Users/ali/my-app")
  ↓
project.ts loads: ~/.enkryptify/projects.json
  ↓
project.ts finds: {
  path: "/Users/ali/my-app",
  provider: "enkryptify",
  workspace: "my-workspace",
  project: "my-app",
  environment: "production"
}
  ↓
run.ts gets: provider = providerRegistry.get("enkryptify")
  ↓
run.ts calls: provider.getSecrets(projectConfig)
  ↓
EnkryptifyProvider makes: API call to get secrets
  ↓
API returns: [
  { name: "DATABASE_URL", value: "postgres://..." },
  { name: "API_KEY", value: "secret-123" }
]
  ↓
run.ts calls: secretInjector.inject(secrets, ["npm", "start"])
  ↓
SecretInjector:
  - Converts secrets to env vars: ["DATABASE_URL=postgres://...", "API_KEY=secret-123"]
  - Sets env vars for command
  - Executes: npm start
  ↓
npm start runs with DATABASE_URL and API_KEY available!
```

---

## 4. `src/providers/base/Provider.ts`

**Purpose**: Defines the interface that all providers must implement

**Responsibilities**:

- Define the contract for providers
- Ensure all providers have the same methods
- Provide TypeScript types for type safety

**Key Interfaces**:

```typescript
// Base provider interface
interface Provider {
  // Identity
  readonly name: string; // "enkryptify", "aws", etc.
  readonly type: string; // Provider type identifier

  // Authentication
  readonly auth: AuthProvider; // Auth handler for this provider

  // Resource discovery (optional - for providers that support it)
  // These are used internally by setup(), not called directly by commands
  getWorkspaces?(): Promise<Workspace[]>;
  getProjects?(workspace: string): Promise<Project[]>;
  getEnvironments?(workspace: string, project: string): Promise<Environment[]>;

  // Secret fetching (required)
  // Each provider interprets its own config structure
  getSecrets(config: ProviderConfig): Promise<Secret[]>;

  // Provider-specific setup (REQUIRED)
  // Each provider handles its own setup flow:
  // - Enkryptify: Interactive workspace/project/environment selection
  // - AWS: Manual region and secretName prompts
  // - GCP: Manual project and secret prompts
  // - Each provider knows best how to set itself up
  setup(options: SetupOptions): Promise<ProjectConfig>;
}

// Provider config is flexible - each provider defines its own shape
interface ProviderConfig {
  [key: string]: any; // Provider-specific fields
}

// Setup options passed to provider.setup()
interface SetupOptions {
  path: string; // Current directory path
  // Provider-specific options can be added here
  [key: string]: any;
}

// Project config returned by provider.setup()
interface ProjectConfig {
  path: string; // Directory path
  provider: string; // Provider name
  [key: string]: any; // Provider-specific fields (workspace/project/env for Enkryptify, region/secretName for AWS, etc.)
}

// Secret structure (normalized across all providers)
interface Secret {
  name: string;
  value: string;
  metadata?: { [key: string]: any }; // Provider-specific metadata
}
```

**Why this exists**:

- Ensures all providers work the same way
- Commands can call `provider.getSecrets()` without knowing which provider
- TypeScript enforces the contract at compile time
- Makes adding new providers straightforward

**Example Usage**:

```typescript
// In run.ts
const provider = providerRegistry.get("enkryptify");
// TypeScript knows provider has getSecrets() method
const secrets = await provider.getSecrets(projectConfig);
// Works the same for AWS, GCP, etc.
```

---

## 5. `src/providers/base/AuthProvider.ts`

**Purpose**: Defines the authentication interface for providers

**Responsibilities**:

- Define how providers handle authentication
- Ensure consistent auth methods across providers
- Provide types for auth operations

**Key Interfaces**:

```typescript
interface AuthProvider {
  // Check authentication status
  isAuthenticated(): Promise<boolean>;

  // Login flow
  login(options?: LoginOptions): Promise<void>;

  // Logout
  logout(): Promise<void>;

  // Get credentials/token
  getCredentials(): Promise<Credentials>;

  // Verify credentials are still valid
  verify(): Promise<boolean>;
}

interface Credentials {
  // Provider-specific credential structure
  // Enkryptify: { accessToken: string }
  // AWS: { accessKeyId: string, secretAccessKey: string }
  // GCP: { credentials: ServiceAccountCredentials }
  [key: string]: any;
}

interface LoginOptions {
  force?: boolean; // Force re-authentication
  // Provider-specific options
  [key: string]: any;
}
```

**Why this exists**:

- Each provider has different auth methods (OAuth, AWS credentials, etc.)
- But they all need the same interface
- Commands can call `provider.auth.login()` without knowing details
- Makes authentication consistent across providers

**Example Usage**:

```typescript
// In login.ts
const provider = providerRegistry.get("enkryptify");
// TypeScript knows provider.auth has login() method
await provider.auth.login({ force: false });
// Works the same for AWS, GCP, etc.
```

---

## 6. `src/providers/registry/ProviderRegistry.ts`

**Purpose**: Central registry for all providers

**Responsibilities**:

- Store all registered providers
- Provide lookup by name
- Provide default provider lookup
- List all available providers

**Key Functions**:

```typescript
class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();

  // Register a provider
  register(provider: Provider): void {
    // Store provider in map
    // Key: provider.name (e.g., "enkryptify")
    // Value: Provider instance
  }

  // Get provider by name
  get(name: string): Provider | undefined {
    // Lookup provider in map
    // Return Provider instance or undefined
  }

  // Get default provider
  getDefault(): Provider | undefined {
    // Get default provider name from auth config
    // Return that provider
  }

  // List all providers
  list(): Provider[] {
    // Return array of all registered providers
  }

  // Check if provider exists
  has(name: string): boolean {
    // Check if provider is registered
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();
```

**Why this exists**:

- Central place to find providers
- Commands don't need to know about specific providers
- Easy to add/remove providers
- Enables provider discovery

**Example Usage**:

```typescript
// In login.ts
const provider = providerRegistry.get("enkryptify");
// Returns EnkryptifyProvider instance

// In setup.ts
const provider = providerRegistry.getDefault();
// Returns default provider (e.g., EnkryptifyProvider)

// List all providers
const allProviders = providerRegistry.list();
// Returns [EnkryptifyProvider, AWSProvider, GCPProvider, ...]
```

**How Providers Register**:

```typescript
// In providers/enkryptify/index.ts
import { EnkryptifyProvider } from "./EnkryptifyProvider";
import { providerRegistry } from "../registry/ProviderRegistry";

const provider = new EnkryptifyProvider();
providerRegistry.register(provider);

export { EnkryptifyProvider, provider };
```

---

## 7. `src/providers/enkryptify/EnkryptifyProvider.ts`

**Purpose**: Enkryptify provider implementation

**Responsibilities**:

- Implement Provider interface for Enkryptify
- Handle Enkryptify-specific logic
- Make API calls to Enkryptify
- Convert Enkryptify responses to normalized format

**Key Implementation**:

```typescript
class EnkryptifyProvider implements Provider {
  readonly name = "enkryptify";
  readonly type = "enkryptify";
  readonly auth: EnkryptifyAuth;

  private httpClient: HttpClient;

  constructor() {
    this.auth = new EnkryptifyAuth();
    this.httpClient = new HttpClient();
  }

  // Get workspaces (for setup)
  async getWorkspaces(): Promise<Workspace[]> {
    // 1. Get access token from auth
    const credentials = await this.auth.getCredentials();

    // 2. Make API call
    const response = await this.httpClient.get("/workspace", {
      headers: { "X-API-Key": credentials.accessToken },
    });

    // 3. Convert to normalized format
    return response.data.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
    }));
  }

  // Get projects (for setup)
  async getProjects(workspaceSlug: string): Promise<Project[]> {
    // Similar to getWorkspaces, but for projects
  }

  // Get environments (for setup)
  async getEnvironments(
    workspaceSlug: string,
    projectSlug: string
  ): Promise<Environment[]> {
    // Similar to above, but for environments
  }

  // Setup method - handles provider-specific setup flow
  async setup(options: SetupOptions): Promise<ProjectConfig> {
    // 1. Fetch workspaces
    const workspaces = await this.getWorkspaces();
    const selectedWorkspace = await ui.select(workspaces, "Select workspace");

    // 2. Fetch projects
    const projects = await this.getProjects(selectedWorkspace.slug);
    const selectedProject = await ui.select(projects, "Select project");

    // 3. Fetch environments
    const environments = await this.getEnvironments(
      selectedWorkspace.slug,
      selectedProject.slug
    );
    const selectedEnv = await ui.select(environments, "Select environment");

    // 4. Return ProjectConfig
    return {
      path: options.path,
      provider: "enkryptify",
      workspace: selectedWorkspace.slug,
      project: selectedProject.slug,
      environment: selectedEnv.id,
    };
  }

  // Get secrets (for run)
  // Provider knows how to interpret its own config structure
  async getSecrets(config: EnkryptifyConfig): Promise<Secret[]> {
    // 1. Interpret config - provider knows its own structure
    const { workspace, project, environment } = config;

    // 2. Get access token
    const credentials = await this.auth.getCredentials();

    // 3. Make API call using provider-specific structure
    const response = await this.httpClient.get(
      `/workspace/${workspace}/project/${project}/secret`,
      {
        params: { environmentId: environment },
        headers: { "X-API-Key": credentials.accessToken },
      }
    );

    // 4. Convert to normalized Secret format
    return response.data.map((secret) => ({
      name: secret.name,
      value: secret.values.find((v) => v.environmentId === environment).value,
      metadata: {
        id: secret.id,
        type: secret.type,
      },
    }));
  }
}
```

**Why this exists**:

- Encapsulates all Enkryptify-specific logic
- Implements Provider interface
- Handles API calls, error handling, data transformation
- Can be replaced or extended without affecting other code

**Dependencies**:

- `providers/base/Provider.ts` - Implements interface
- `providers/enkryptify/EnkryptifyAuth.ts` - For authentication
- `storage/Keyring.ts` - For token storage (via auth)

---

## 8. `src/providers/enkryptify/EnkryptifyAuth.ts`

**Purpose**: Enkryptify authentication implementation

**Responsibilities**:

- Implement OAuth 2.0 with PKCE flow
- Handle browser-based authentication
- Store tokens in keyring
- Verify token validity

**Key Implementation**:

```typescript
class EnkryptifyAuth implements AuthProvider {
  private keyring: Keyring;
  private httpClient: HttpClient;

  constructor() {
    this.keyring = new Keyring();
    this.httpClient = new HttpClient();
  }

  async isAuthenticated(): Promise<boolean> {
    // 1. Check environment variable first
    if (process.env.ENKRYPTIFY_TOKEN) {
      return true;
    }

    // 2. Check keyring
    const authInfo = await this.keyring.get("enkryptify-auth");
    return authInfo !== null;
  }

  async login(options?: LoginOptions): Promise<void> {
    // 1. Check if already authenticated (unless force)
    if (!options?.force && (await this.isAuthenticated())) {
      const isValid = await this.verify();
      if (isValid) {
        return; // Already logged in
      }
    }

    // 2. Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // 3. Start local callback server
    const server = startCallbackServer(state, codeVerifier);

    // 4. Build OAuth URL
    const authURL = buildAuthURL(codeChallenge, state);

    // 5. Open browser
    await openBrowser(authURL);

    // 6. Wait for callback
    const authResponse = await waitForCallback(server);

    // 7. Exchange code for token
    const token = await exchangeCodeForToken(authResponse.code, codeVerifier);

    // 8. Store token in keyring
    await this.keyring.set("enkryptify-auth", {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      // ... other fields
    });
  }

  async getCredentials(): Promise<Credentials> {
    // 1. Check environment variable
    if (process.env.ENKRYPTIFY_TOKEN) {
      return { accessToken: process.env.ENKRYPTIFY_TOKEN };
    }

    // 2. Get from keyring
    const authInfo = await this.keyring.get("enkryptify-auth");
    if (!authInfo) {
      throw new Error("Not authenticated");
    }

    // 3. Check expiration
    if (authInfo.expiresAt && Date.now() > authInfo.expiresAt) {
      throw new Error("Token expired");
    }

    return { accessToken: authInfo.accessToken };
  }

  async verify(): Promise<boolean> {
    try {
      const credentials = await this.getCredentials();
      // Make API call to verify token
      await this.httpClient.get("/me", {
        headers: { "X-API-Key": credentials.accessToken },
      });
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    await this.keyring.delete("enkryptify-auth");
  }
}
```

**Why this exists**:

- Encapsulates Enkryptify-specific auth logic
- Implements AuthProvider interface
- Handles OAuth flow, token storage, verification
- Can be tested independently

**Dependencies**:

- `providers/base/AuthProvider.ts` - Implements interface
- `storage/Keyring.ts` - For token storage
- `utils/logger.ts` - For logging

---

## 9. `src/config/paths.ts`

**Purpose**: Centralized config file path management

**Responsibilities**:

- Define where config files are stored
- Provide path resolution utilities
- Handle platform differences (Windows vs Unix)

**Key Functions**:

```typescript
import * as path from "path";
import * as os from "os";

// Main config directory
export function getConfigDir(): string {
  // Option 1: ~/.enkryptify
  const homeDir = os.homedir();
  return path.join(homeDir, ".enkryptify");

  // Option 2: ~/.config/enkryptify (XDG standard)
  // return path.join(homeDir, '.config', 'enkryptify');
}

// Project config file path
export function getProjectConfigPath(): string {
  return path.join(getConfigDir(), "projects.json");
}

// Auth config file path
export function getAuthConfigPath(): string {
  return path.join(getConfigDir(), "auth.json");
}

// Provider-specific config directory
export function getProviderConfigDir(): string {
  return path.join(getConfigDir(), "providers");
}

// Provider-specific config file path
export function getProviderConfigPath(providerName: string): string {
  return path.join(getProviderConfigDir(), `${providerName}.json`);
}
```

**Why this exists**:

- Single source of truth for config paths
- Easy to change config location
- Consistent across the app
- Handles platform differences

**Example Usage**:

```typescript
// In project.ts
import { getProjectConfigPath } from "./paths";

const configPath = getProjectConfigPath();
// Returns: "/Users/ali/.enkryptify/projects.json"
```

---

## 10. `src/config/project.ts`

**Purpose**: Manages project-level configuration (directory mappings)

**Responsibilities**:

- Load project configs from file
- Save project configs to file
- Find config for a directory path
- Add/update/remove project configs

**Key Implementation**:

```typescript
interface ProjectConfig {
  path: string; // Directory path
  provider: string; // Provider name (e.g., "enkryptify")
  [key: string]: any; // Provider-specific fields
}

interface ProjectStorage {
  projects: ProjectConfig[];
}

class ProjectConfigManager {
  private filePath: string;

  constructor() {
    this.filePath = getProjectConfigPath();
  }

  // Load all project configs from file
  private async load(): Promise<ProjectStorage> {
    // 1. Check if file exists
    if (!(await fs.exists(this.filePath))) {
      return { projects: [] };
    }

    // 2. Read file
    const content = await fs.readFile(this.filePath, "utf-8");

    // 3. Parse JSON
    return JSON.parse(content);
  }

  // Save all project configs to file
  private async save(storage: ProjectStorage): Promise<void> {
    // 1. Ensure directory exists
    await fs.ensureDir(path.dirname(this.filePath));

    // 2. Write file with pretty formatting
    await fs.writeFile(
      this.filePath,
      JSON.stringify(storage, null, 2),
      "utf-8"
    );
  }

  // Get config for a specific path
  async getForPath(path: string): Promise<ProjectConfig | null> {
    const storage = await this.load();

    // Find exact match or closest parent
    const config = storage.projects.find((p) => p.path === path);

    if (config) {
      return config;
    }

    // Try to find parent directory match
    // (e.g., if /Users/ali/my-app/frontend doesn't exist,
    //  but /Users/ali/my-app does, use that)
    const sorted = storage.projects
      .filter((p) => path.startsWith(p.path))
      .sort((a, b) => b.path.length - a.path.length);

    return sorted[0] || null;
  }

  // Save a project config
  async save(config: ProjectConfig): Promise<void> {
    const storage = await this.load();

    // Find existing config for this path
    const index = storage.projects.findIndex((p) => p.path === config.path);

    if (index >= 0) {
      // Update existing
      storage.projects[index] = config;
    } else {
      // Add new
      storage.projects.push(config);
    }

    await this.save(storage);
  }

  // Check if path has config
  async hasConfig(path: string): Promise<boolean> {
    const config = await this.getForPath(path);
    return config !== null;
  }

  // Remove config for path
  async remove(path: string): Promise<void> {
    const storage = await this.load();
    storage.projects = storage.projects.filter((p) => p.path !== path);
    await this.save(storage);
  }
}

// Singleton instance
export const projectConfig = new ProjectConfigManager();
```

**File Structure** (`~/.enkryptify/projects.json`):

```json
{
  "projects": [
    {
      "path": "/Users/ali/my-app/frontend",
      "provider": "enkryptify",
      "workspace": "my-workspace",
      "project": "frontend-app",
      "environment": "production"
    },
    {
      "path": "/Users/ali/my-app/backend",
      "provider": "aws",
      "region": "us-east-1",
      "secretName": "backend-secrets"
    }
  ]
}
```

**Why this exists**:

- Manages directory → provider mappings
- Separate from auth config
- Easy to query and update
- Supports multiple projects with different providers

**Dependencies**:

- `config/paths.ts` - For file path
- File system utilities

---

## 11. `src/config/auth.ts`

**Purpose**: Manages provider authentication status

**Responsibilities**:

- Track which providers are authenticated
- Store default provider
- Update authentication status
- Provide authentication queries

**Key Implementation**:

```typescript
interface ProviderAuthInfo {
  authenticated: boolean;
  last_login?: number;
  type: string;
  [key: string]: any; // Provider-specific settings
}

interface AuthStorage {
  default_provider: string;
  providers: {
    [providerName: string]: ProviderAuthInfo;
  };
}

class AuthConfigManager {
  private filePath: string;

  constructor() {
    this.filePath = getAuthConfigPath();
  }

  // Load auth config from file
  private async load(): Promise<AuthStorage> {
    if (!(await fs.exists(this.filePath))) {
      return {
        default_provider: "enkryptify",
        providers: {},
      };
    }

    const content = await fs.readFile(this.filePath, "utf-8");
    return JSON.parse(content);
  }

  // Save auth config to file
  private async save(storage: AuthStorage): Promise<void> {
    await fs.ensureDir(path.dirname(this.filePath));
    await fs.writeFile(
      this.filePath,
      JSON.stringify(storage, null, 2),
      "utf-8"
    );
  }

  // Mark provider as authenticated
  async markAuthenticated(
    providerName: string,
    settings: Partial<ProviderAuthInfo>
  ): Promise<void> {
    const storage = await this.load();

    storage.providers[providerName] = {
      authenticated: true,
      last_login: Date.now(),
      type: providerName,
      ...settings,
    };

    await this.save(storage);
  }

  // Check if provider is authenticated
  async isAuthenticated(providerName: string): Promise<boolean> {
    const storage = await this.load();
    const provider = storage.providers[providerName];
    return provider?.authenticated === true;
  }

  // Get default provider
  async getDefaultProvider(): Promise<string> {
    const storage = await this.load();
    return storage.default_provider;
  }

  // Set default provider
  async setDefaultProvider(providerName: string): Promise<void> {
    const storage = await this.load();
    storage.default_provider = providerName;
    await this.save(storage);
  }

  // Mark provider as logged out
  async markLoggedOut(providerName: string): Promise<void> {
    const storage = await this.load();
    if (storage.providers[providerName]) {
      storage.providers[providerName].authenticated = false;
      await this.save(storage);
    }
  }

  // Get provider auth info
  async getProviderInfo(
    providerName: string
  ): Promise<ProviderAuthInfo | null> {
    const storage = await this.load();
    return storage.providers[providerName] || null;
  }
}

// Singleton instance
export const authConfig = new AuthConfigManager();
```

**File Structure** (`~/.enkryptify/auth.json`):

```json
{
  "default_provider": "enkryptify",
  "providers": {
    "enkryptify": {
      "authenticated": true,
      "last_login": 1764576243,
      "type": "enkryptify"
    },
    "aws": {
      "authenticated": true,
      "last_login": 1764576244,
      "type": "aws",
      "region": "us-east-1"
    }
  }
}
```

**Why this exists**:

- Tracks authentication status (not actual tokens - those are in keyring)
- Separate from project config
- Easy to query authentication state
- Supports multiple authenticated providers

**Dependencies**:

- `config/paths.ts` - For file path
- File system utilities

---

## 12. `src/storage/Keyring.ts`

**Purpose**: Secure storage abstraction for tokens/credentials

**Responsibilities**:

- Store sensitive data (tokens, credentials) securely
- Use OS keyring (macOS Keychain, Linux Secret Service, Windows Credential Manager)
- Provide consistent interface across platforms

**Key Implementation**:

```typescript
interface Keyring {
  // Store a value
  set(key: string, value: any): Promise<void>;

  // Get a value
  get(key: string): Promise<any | null>;

  // Delete a value
  delete(key: string): Promise<void>;

  // Check if key exists
  has(key: string): Promise<boolean>;
}

class OSKeyring implements Keyring {
  private serviceName = "enkryptify-cli";

  async set(key: string, value: any): Promise<void> {
    // Use keyring library (e.g., keytar for Node.js)
    // Store JSON-serialized value
    const serialized = JSON.stringify(value);
    await keytar.setPassword(this.serviceName, key, serialized);
  }

  async get(key: string): Promise<any | null> {
    // Get from keyring
    const serialized = await keytar.getPassword(this.serviceName, key);
    if (!serialized) {
      return null;
    }

    // Parse JSON
    return JSON.parse(serialized);
  }

  async delete(key: string): Promise<void> {
    await keytar.deletePassword(this.serviceName, key);
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }
}

// Singleton instance
export const keyring = new OSKeyring();
```

**Why this exists**:

- Tokens/credentials should NOT be in config files
- OS keyring is secure and encrypted
- Provides consistent interface
- Handles platform differences

**Storage Keys**:

- `enkryptify-auth`: Enkryptify token
- `aws-auth`: AWS credentials
- `gcp-auth`: GCP credentials
- etc.

**Dependencies**:

- Keyring library (e.g., `keytar` for Node.js)

---

## 13. `src/inject/SecretInjector.ts`

**Purpose**: Inject secrets as environment variables and execute commands

**Responsibilities**:

- Convert secrets to environment variables
- Set environment variables for command
- Execute command with secrets
- Handle command output and errors

**Key Implementation**:

```typescript
interface Secret {
  name: string;
  value: string;
}

class SecretInjector {
  // Inject secrets and run command
  async injectAndRun(
    secrets: Secret[],
    command: string[],
    options?: InjectOptions
  ): Promise<void> {
    // 1. Start with current environment
    const env = { ...process.env };

    // 2. Add secrets as environment variables
    for (const secret of secrets) {
      env[secret.name] = secret.value;
    }

    // 3. Prepare command
    const [cmd, ...args] = command;

    // 4. Execute command with environment
    const childProcess = spawn(cmd, args, {
      env,
      stdio: "inherit", // Use parent's stdin/stdout/stderr
      shell: true,
    });

    // 5. Wait for completion
    return new Promise((resolve, reject) => {
      childProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });

      childProcess.on("error", (error) => {
        reject(error);
      });
    });
  }

  // Convert secrets to environment variable format
  private secretsToEnvVars(secrets: Secret[]): Record<string, string> {
    const envVars: Record<string, string> = {};

    for (const secret of secrets) {
      envVars[secret.name] = secret.value;
    }

    return envVars;
  }
}

// Singleton instance
export const secretInjector = new SecretInjector();
```

**Why this exists**:

- Encapsulates secret injection logic
- Handles command execution
- Manages environment variables
- Can be tested independently

**Dependencies**:

- Node.js `child_process` module

---

# Delegation Pattern Explained

## Why Delegation is Important

Both `setup` and `run` commands delegate to providers because **not all providers have the same structure**:

- **Enkryptify**: Has workspaces → projects → environments
- **AWS**: Has regions → secret names (no hierarchy)
- **GCP**: Has projects → secret names (different structure)
- **Vault**: Has paths → mount points (completely different)

## How Setup Delegates

**Command (`setup.ts`) does NOT know provider structures**:

```typescript
// setup.ts - Simple delegation
const provider = providerRegistry.get(providerName);
const projectConfig = await provider.setup({ path: currentPath });
await projectConfig.save(projectConfig);
```

**Each Provider handles its own setup**:

- **Enkryptify**: Calls `getWorkspaces()` → `getProjects()` → `getEnvironments()` internally
- **AWS**: Prompts for `region` and `secretName` manually
- **GCP**: Prompts for `project` and `secretName` manually
- Each provider returns a `ProjectConfig` with its own structure

## How Run Delegates

**Command (`run.ts`) does NOT know provider config structures**:

```typescript
// run.ts - Simple delegation
const projectConfig = await projectConfig.getForPath(currentPath);
const provider = providerRegistry.get(projectConfig.provider);
const secrets = await provider.getSecrets(projectConfig);
```

**Each Provider interprets its own config**:

- **Enkryptify**: Reads `workspace`, `project`, `environment` from config
- **AWS**: Reads `region`, `secretName` from config
- **GCP**: Reads `project`, `secretName` from config
- Each provider knows how to use its own config structure

## Benefits

1. **Commands stay simple**: No provider-specific logic in commands
2. **Easy to add providers**: Just implement `setup()` and `getSecrets()`
3. **No changes to core code**: Adding AWS doesn't require changing `setup.ts` or `run.ts`
4. **Type-safe**: TypeScript ensures providers implement the interface correctly

---

# Complete Flow Examples

## Flow 1: `ek login enkryptify`

**Step-by-step file interactions**:

```
1. User types: ek login enkryptify
   ↓
2. CLI framework (e.g., commander.js) parses command
   ↓
3. routes to: commands/login.ts → runLogin("enkryptify")
   ↓
4. login.ts calls: providerRegistry.get("enkryptify")
   ↓
   File: providers/registry/ProviderRegistry.ts
   - Looks up "enkryptify" in providers map
   - Returns EnkryptifyProvider instance
   ↓
5. login.ts calls: authConfig.isAuthenticated("enkryptify")
   ↓
   File: config/auth.ts
   - Loads ~/.enkryptify/auth.json
   - Checks providers["enkryptify"].authenticated
   - Returns: false (not authenticated)
   ↓
6. login.ts calls: provider.auth.isAuthenticated()
   ↓
   File: providers/enkryptify/EnkryptifyAuth.ts
   - Checks keyring.get("enkryptify-auth")
   - Returns: false (no token in keyring)
   ↓
7. login.ts calls: provider.auth.login()
   ↓
   File: providers/enkryptify/EnkryptifyAuth.ts
   - Generates PKCE parameters
   - Starts local callback server (port 51823)
   - Builds OAuth URL
   - Opens browser
   - Waits for callback
   ↓
8. User logs in browser, OAuth redirects to localhost:51823/callback
   ↓
9. EnkryptifyAuth receives callback with authorization code
   ↓
10. EnkryptifyAuth calls: exchangeCodeForToken(code, codeVerifier)
    ↓
    - Makes HTTP POST to Enkryptify API
    - Receives access token
    ↓
11. EnkryptifyAuth calls: keyring.set("enkryptify-auth", tokenData)
    ↓
    File: storage/Keyring.ts
    - Stores token in OS keyring (macOS Keychain, etc.)
    ↓
12. EnkryptifyAuth returns success to login.ts
    ↓
13. login.ts calls: authConfig.markAuthenticated("enkryptify", {...})
    ↓
    File: config/auth.ts
    - Loads ~/.enkryptify/auth.json
    - Updates providers["enkryptify"] = { authenticated: true, ... }
    - Saves to file
    ↓
14. login.ts shows success message
    ↓
15. Done!
```

**Files Involved**:

1. `commands/login.ts` - Coordinates flow
2. `providers/registry/ProviderRegistry.ts` - Provides provider instance
3. `config/auth.ts` - Checks/updates auth status
4. `providers/enkryptify/EnkryptifyAuth.ts` - Handles OAuth flow
5. `storage/Keyring.ts` - Stores token securely

---

## Flow 2: `ek setup enkryptify`

**Step-by-step file interactions**:

```
1. User types: ek setup enkryptify
   ↓
2. CLI framework routes to: commands/setup.ts → runSetup("enkryptify")
   ↓
3. setup.ts calls: authConfig.isAuthenticated("enkryptify")
   ↓
   File: config/auth.ts
   - Loads ~/.enkryptify/auth.json
   - Returns: true (authenticated)
   ↓
4. setup.ts calls: process.cwd()
   ↓
   - Returns: "/Users/ali/my-app"
   ↓
5. setup.ts calls: projectConfig.hasConfig("/Users/ali/my-app")
   ↓
   File: config/project.ts
   - Loads ~/.enkryptify/projects.json
   - Checks if path exists
   - Returns: false (no config yet)
   ↓
6. setup.ts calls: providerRegistry.get("enkryptify")
   ↓
   File: providers/registry/ProviderRegistry.ts
   - Returns EnkryptifyProvider instance
   ↓
7. setup.ts calls: provider.setup({ path: currentPath })
   ↓
   File: providers/enkryptify/EnkryptifyProvider.ts
   - setup() method handles entire flow internally:
     * Calls: provider.getWorkspaces() (internal)
     * Makes API call: GET /workspace
     * Shows list to user
     * User selects: "my-workspace"
     * Calls: provider.getProjects("my-workspace") (internal)
     * Makes API call: GET /workspace/my-workspace/project
     * User selects: "my-app"
     * Calls: provider.getEnvironments("my-workspace", "my-app") (internal)
     * Makes API call: GET /workspace/my-workspace/project/my-app
     * User selects: "production"
     * Creates and returns: ProjectConfig {
         path: "/Users/ali/my-app",
         provider: "enkryptify",
         workspace: "my-workspace",
         project: "my-app",
         environment: "prod-123"
       }
   ↓
8. setup.ts receives: ProjectConfig from provider.setup()
   ↓
9. setup.ts calls: projectConfig.save(config)
    ↓
    File: config/project.ts
    - Loads ~/.enkryptify/projects.json
    - Adds new project config to projects array
    - Saves to file
    ↓
15. setup.ts shows success message
    ↓
16. Done!
```

**Files Involved**:

1. `commands/setup.ts` - Coordinates flow, delegates to provider
2. `config/auth.ts` - Validates authentication
3. `config/project.ts` - Saves project config
4. `providers/registry/ProviderRegistry.ts` - Provides provider instance
5. `providers/enkryptify/EnkryptifyProvider.ts` - Handles its own setup flow (fetches resources, prompts user, returns config)

---

## Flow 3: `ek run -- npm start`

**Step-by-step file interactions**:

```
1. User types: ek run -- npm start
   ↓
2. CLI framework routes to: commands/run.ts → runRun(["npm", "start"])
   ↓
3. run.ts calls: authConfig.isAuthenticated() (checks default provider)
   ↓
   File: config/auth.ts
   - Loads ~/.enkryptify/auth.json
   - Gets default_provider: "enkryptify"
   - Checks providers["enkryptify"].authenticated
   - Returns: true
   ↓
4. run.ts calls: process.cwd()
   ↓
   - Returns: "/Users/ali/my-app"
   ↓
5. run.ts calls: projectConfig.getForPath("/Users/ali/my-app")
   ↓
   File: config/project.ts
   - Loads ~/.enkryptify/projects.json
   - Finds matching path
   - Returns: {
       path: "/Users/ali/my-app",
       provider: "enkryptify",
       workspace: "my-workspace",
       project: "my-app",
       environment: "prod-123"
     }
   ↓
6. run.ts calls: providerRegistry.get("enkryptify")
   ↓
   File: providers/registry/ProviderRegistry.ts
   - Returns EnkryptifyProvider instance
   ↓
7. run.ts calls: provider.getSecrets(projectConfig)
   ↓
   File: providers/enkryptify/EnkryptifyProvider.ts
   - Provider receives config: { workspace: "my-workspace", project: "my-app", environment: "prod-123" }
   - Provider knows how to interpret its own config structure
   - Calls: provider.auth.getCredentials()
   - Gets token from keyring
   - Makes API call: GET /workspace/my-workspace/project/my-app/secret?environmentId=prod-123
   - API returns: [
       { name: "DATABASE_URL", values: [{ environmentId: "prod-123", value: "postgres://..." }] },
       { name: "API_KEY", values: [{ environmentId: "prod-123", value: "secret-123" }] }
     ]
   - Converts to normalized format: [
       { name: "DATABASE_URL", value: "postgres://..." },
       { name: "API_KEY", value: "secret-123" }
     ]
   - Returns secrets array

   **Note**: If this was AWS provider:
   - Provider receives config: { region: "us-east-1", secretName: "my-secrets" }
   - Provider knows how to interpret AWS config structure
   - Calls AWS Secrets Manager API with region and secretName
   - Returns normalized secrets array
   - Same interface, different implementation!
   ↓
8. run.ts calls: secretInjector.injectAndRun(secrets, ["npm", "start"])
   ↓
   File: inject/SecretInjector.ts
   - Starts with: process.env (current environment)
   - Adds secrets: {
       ...process.env,
       DATABASE_URL: "postgres://...",
       API_KEY: "secret-123"
     }
   - Executes: spawn("npm", ["start"], { env: {...} })
   - npm start runs with DATABASE_URL and API_KEY available!
   ↓
9. Command completes
   ↓
10. Done!
```

**Files Involved**:

1. `commands/run.ts` - Coordinates flow
2. `config/auth.ts` - Validates authentication
3. `config/project.ts` - Gets project config
4. `providers/registry/ProviderRegistry.ts` - Provides provider
5. `providers/enkryptify/EnkryptifyProvider.ts` - Fetches secrets
6. `storage/Keyring.ts` - Provides token (via auth)
7. `inject/SecretInjector.ts` - Injects secrets and runs command

---

# File Interactions

## Interaction Diagram: Login Flow

```
commands/login.ts
    │
    ├─→ providers/registry/ProviderRegistry.ts (get provider)
    │       └─→ Returns: EnkryptifyProvider
    │
    ├─→ config/auth.ts (check auth status)
    │       └─→ Reads: ~/.enkryptify/auth.json
    │
    ├─→ providers/enkryptify/EnkryptifyAuth.ts (login)
    │       ├─→ storage/Keyring.ts (store token)
    │       │       └─→ OS Keyring (macOS Keychain, etc.)
    │       └─→ HTTP Client (OAuth API calls)
    │
    └─→ config/auth.ts (mark authenticated)
            └─→ Writes: ~/.enkryptify/auth.json
```

## Interaction Diagram: Setup Flow

```
commands/setup.ts
    │
    ├─→ config/auth.ts (validate auth)
    │       └─→ Reads: ~/.enkryptify/auth.json
    │
    ├─→ config/project.ts (check existing config)
    │       └─→ Reads: ~/.enkryptify/projects.json
    │
    ├─→ providers/registry/ProviderRegistry.ts (get provider)
    │       └─→ Returns: EnkryptifyProvider
    │
    ├─→ providers/enkryptify/EnkryptifyProvider.ts (setup method)
    │       ├─→ Calls getWorkspaces/getProjects/getEnvironments internally
    │       ├─→ providers/enkryptify/EnkryptifyAuth.ts (get token)
    │       │       └─→ storage/Keyring.ts (get token)
    │       ├─→ HTTP Client (API calls)
    │       └─→ Returns ProjectConfig
    │
    └─→ config/project.ts (save config)
            └─→ Writes: ~/.enkryptify/projects.json
```

## Interaction Diagram: Run Flow

```
commands/run.ts
    │
    ├─→ config/auth.ts (validate auth)
    │       └─→ Reads: ~/.enkryptify/auth.json
    │
    ├─→ config/project.ts (get project config)
    │       └─→ Reads: ~/.enkryptify/projects.json
    │
    ├─→ providers/registry/ProviderRegistry.ts (get provider)
    │       └─→ Returns: EnkryptifyProvider
    │
    ├─→ providers/enkryptify/EnkryptifyProvider.ts (get secrets)
    │       ├─→ Interprets its own config structure (workspace/project/environment)
    │       ├─→ providers/enkryptify/EnkryptifyAuth.ts (get token)
    │       │       └─→ storage/Keyring.ts (get token)
    │       └─→ HTTP Client (API call for secrets)
    │
    └─→ inject/SecretInjector.ts (inject and run)
            └─→ Node.js child_process (execute command)

**Note**: Each provider knows how to interpret its own config:
- Enkryptify: Reads workspace/project/environment
- AWS: Reads region/secretName
- GCP: Reads project/secretName
- The command doesn't need to know provider-specific structures!
```

---

# Error Handling Flow

## Error: Not Authenticated

```
User runs: ek run -- npm start
  ↓
run.ts calls: authConfig.isAuthenticated()
  ↓
Returns: false
  ↓
run.ts throws: AuthenticationError("Not authenticated")
  ↓
run.ts shows: "You must be authenticated. Run 'ek login' first."
  ↓
Exits with error code 1
```

## Error: No Project Config

```
User runs: ek run -- npm start
  ↓
run.ts calls: projectConfig.getForPath("/Users/ali/my-app")
  ↓
Returns: null (no config found)
  ↓
run.ts throws: ConfigurationError("No setup found")
  ↓
run.ts shows: "No setup found for current directory. Run 'ek setup' first."
  ↓
Exits with error code 1
```

## Error: Provider Not Found

```
User runs: ek login unknown-provider
  ↓
login.ts calls: providerRegistry.get("unknown-provider")
  ↓
Returns: undefined
  ↓
login.ts throws: ProviderError("Provider not found")
  ↓
login.ts shows: "Provider 'unknown-provider' not found. Available: enkryptify, aws, gcp"
  ↓
Exits with error code 1
```

## Error: Secret Fetch Failed

```
User runs: ek run -- npm start
  ↓
run.ts calls: provider.getSecrets(projectConfig)
  ↓
EnkryptifyProvider makes API call
  ↓
API returns: 401 Unauthorized (token expired)
  ↓
EnkryptifyProvider throws: AuthenticationError("Token expired")
  ↓
run.ts catches error
  ↓
run.ts shows: "Authentication failed. Please run 'ek login' again."
  ↓
Exits with error code 1
```

---

# Adding a New Provider

## Step-by-Step: Adding AWS Secrets Manager

### Step 1: Create Provider Files

```
src/providers/aws/
├── index.ts
├── AWSProvider.ts
├── AWSAuth.ts
└── types.ts
```

### Step 2: Implement Provider Interface

**File: `src/providers/aws/AWSProvider.ts`**

```typescript
import { Provider } from "../base/Provider";
import { AWSAuth } from "./AWSAuth";

class AWSProvider implements Provider {
  readonly name = "aws";
  readonly type = "aws";
  readonly auth: AWSAuth;

  // Setup method - handles AWS-specific setup flow
  async setup(options: SetupOptions): Promise<ProjectConfig> {
    // AWS doesn't have workspaces/projects/environments
    // So we prompt for provider-specific fields manually
    const region = await ui.prompt("AWS Region:", "us-east-1");
    const secretName = await ui.prompt("Secret Name:", "");

    // Return ProjectConfig with AWS-specific structure
    return {
      path: options.path,
      provider: "aws",
      region: region,
      secretName: secretName,
    };
  }

  // Get secrets - provider knows how to interpret its own config
  async getSecrets(config: AWSConfig): Promise<Secret[]> {
    // 1. Interpret config - provider knows its own structure
    const { region, secretName } = config;

    // 2. Get AWS credentials from auth
    const credentials = await this.auth.getCredentials();

    // 3. Create AWS Secrets Manager client
    const client = new SecretsManagerClient({
      region: region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });

    // 4. Fetch secret using provider-specific structure
    const response = await client.getSecretValue({
      SecretId: secretName,
    });

    // 5. Parse JSON secret
    const secrets = JSON.parse(response.SecretString);

    // 6. Convert to normalized format
    return Object.entries(secrets).map(([name, value]) => ({
      name,
      value: String(value),
    }));
  }

  // AWS doesn't have workspaces/projects/environments
  // So these methods are optional (not implemented)
}
```

**File: `src/providers/aws/AWSAuth.ts`**

```typescript
import { AuthProvider } from "../base/AuthProvider";

class AWSAuth implements AuthProvider {
  async isAuthenticated(): Promise<boolean> {
    // Check AWS credentials from environment or AWS config files
    // AWS SDK automatically checks:
    // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    // 2. ~/.aws/credentials file
    // 3. IAM role (if running on EC2)
    return await this.hasCredentials();
  }

  async login(options?: LoginOptions): Promise<void> {
    // AWS doesn't have interactive login
    // Just verify credentials exist
    if (!(await this.isAuthenticated())) {
      throw new Error(
        "AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
      );
    }
  }

  async getCredentials(): Promise<Credentials> {
    // Get from AWS SDK default credential provider chain
    const credentials = await defaultProvider();
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    };
  }

  async verify(): Promise<boolean> {
    // Try to make a simple API call
    try {
      const client = new STSClient({});
      await client.send(new GetCallerIdentityCommand({}));
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    // AWS doesn't have logout - credentials are external
    // Could clear cached credentials if stored
  }
}
```

### Step 3: Register Provider

**File: `src/providers/aws/index.ts`**

```typescript
import { AWSProvider } from "./AWSProvider";
import { providerRegistry } from "../registry/ProviderRegistry";

const provider = new AWSProvider();
providerRegistry.register(provider);

export { AWSProvider, provider };
```

### Step 4: Export from Main Index

**File: `src/providers/index.ts`**

```typescript
export * from "./enkryptify";
export * from "./aws"; // Add this line
```

### Step 5: Done!

**No changes needed to**:

- `commands/login.ts` - Works automatically
- `commands/setup.ts` - Works automatically! Just calls `provider.setup()`
- `commands/run.ts` - Works automatically! Just calls `provider.getSecrets(config)`
- `config/project.ts` - Works automatically
- `config/auth.ts` - Works automatically

**Why this works**:

- **Setup**: Each provider implements `setup()` method that handles its own flow

  - Enkryptify: Interactive workspace/project/environment selection
  - AWS: Manual region/secretName prompts
  - Each provider knows best how to set itself up

- **Run**: Each provider implements `getSecrets(config)` that interprets its own config
  - Enkryptify: Reads `workspace`, `project`, `environment` from config
  - AWS: Reads `region`, `secretName` from config
  - The command doesn't need to know provider-specific structures!

**Usage**:

```bash
# Login (just verifies credentials exist)
ek login aws

# Setup - provider handles its own flow
ek setup aws
# AWSProvider.setup() prompts for: region, secretName

# Run - provider interprets its own config
ek run -- npm start
# AWSProvider.getSecrets() reads region/secretName from config
# Fetches secrets from AWS Secrets Manager
```

---

# Summary

## Key Design Principles

1. **Separation of Concerns**:

   - Commands: Coordination and UI
   - Providers: Business logic
   - Config: Data management
   - Storage: Secure token storage

2. **Interface-Based Design**:

   - All providers implement same interface
   - Commands don't know about specific providers
   - Commands delegate to providers via interface methods
   - Each provider handles its own setup flow (`setup()`)
   - Each provider interprets its own config structure (`getSecrets(config)`)
   - Easy to add new providers

3. **Configuration Separation**:

   - Project config: Directory mappings
   - Auth config: Authentication status
   - Provider config: Provider-specific settings (optional)

4. **Registry Pattern**:

   - Central provider registry
   - Providers register themselves
   - Easy discovery and lookup

5. **Dependency Injection**:
   - Commands get providers from registry
   - Config managers are singletons
   - Easy to test and mock

## File Responsibilities Summary

| File                                         | Responsibility                                                  | Reads                        | Writes          |
| -------------------------------------------- | --------------------------------------------------------------- | ---------------------------- | --------------- |
| `commands/login.ts`                          | Coordinate login flow                                           | -                            | `auth.json`     |
| `commands/setup.ts`                          | Coordinate setup flow, delegates to `provider.setup()`          | `auth.json`, `projects.json` | `projects.json` |
| `commands/run.ts`                            | Coordinate run flow, delegates to `provider.getSecrets(config)` | `auth.json`, `projects.json` | -               |
| `providers/registry/ProviderRegistry.ts`     | Provider lookup                                                 | -                            | -               |
| `providers/enkryptify/EnkryptifyProvider.ts` | Enkryptify logic                                                | Keyring                      | -               |
| `providers/enkryptify/EnkryptifyAuth.ts`     | Enkryptify auth                                                 | Keyring                      | Keyring         |
| `config/project.ts`                          | Project config management                                       | `projects.json`              | `projects.json` |
| `config/auth.ts`                             | Auth config management                                          | `auth.json`                  | `auth.json`     |
| `storage/Keyring.ts`                         | Secure storage                                                  | OS Keyring                   | OS Keyring      |
| `inject/SecretInjector.ts`                   | Secret injection                                                | -                            | -               |

This architecture is clean, extensible, and maintainable. Adding new providers or commands requires minimal changes to existing code.
