# Enkryptify CLI

Enkryptify CLI is a command-line tool that securely manages and injects secrets from various secret management providers (Enkryptify, AWS, etc.) directly into your commands and applications.

**Key Features:**

## Quick Start

### 1. Login to Your Provider

```bash
ek login
```

This will authenticate you with your default provider (Enkryptify). For other providers:

```bash
ek login --provider enkryptify
ek login --provider aws
```

### 2. Configure Your Project

Navigate to your project directory and run the configure command. You only need to do this once per project (works for both backend and frontend):

```bash
cd /path/to/your/project
ek configure
```

The configuration process varies by provider. For Enkryptify, the interactive setup will guide you through:

- Selecting your workspace
- Choosing your project
- Selecting the environment

Once configured, the CLI automatically detects your project settings when you run commands from this directory or any subdirectory.

### 3. Run Commands with Secrets

Run any command with secrets automatically injected as environment variables. The `--` separator is optional (only needed if you have flags that might conflict):

```bash
ek run npm start
ek run python app.py
ek run --env production  npm run deploy
ek run -- pnpm run dev  # -- is optional
```

Secrets are automatically fetched from your provider and injected as environment variables, making them available to your application at runtime.

---

## Architecture

## File Structure

```
src/
├── cmd/              # CLI command handlers
│   ├── index.ts     # Command registry
│   ├── login.ts
│   ├── configure.ts
│   ├── run.ts
│   ├── listCommand.ts
│   ├── create.ts
│   ├── update.ts
│   └── delete.ts
├── providers/        # Provider implementations
│   ├── base/        # Interfaces
│   │   ├── Provider.ts
│   │   └── AuthProvider.ts
│   ├── registry/    # Provider registry
│   │   ├── ProviderRegistry.ts
│   │   └── index.ts
│   └── enkryptfiy/  # Enkryptify provider
│       ├── provider.ts
│       ├── auth.ts
│       └── httpClient.ts
├── lib/             # Shared utilities
│   ├── config.ts    # All config management (auth + project)
|
└── ui/              # Ink UI components
```

---

## Folder Explanations

### `cmd/` Folder - Command Handlers

**Purpose:** Contains all CLI command implementations. Commands are thin coordinators that delegate all actual work to providers.

**What it does:**

- Defines command structure (name, options, arguments)
- Validates user input
- Gets provider from registry
- Delegates to provider methods
- Handles errors consistently

**Key principle:** Commands don't contain provider-specific logic. They coordinate the flow but let providers do the work.

### `providers/` Folder - Provider Implementations

**Purpose:** Contains all secret management provider integrations. Each provider knows how to authenticate, fetch secrets, and perform CRUD operations on secrets.

**What it does:**

- Implements provider-specific logic (API calls, data transformation)
- Handles authentication via AuthProvider
- Manages secrets (list, create, update, delete, inject)
- Provides project configuration flows

**Key principle:** All providers implement the same `Provider` interface, so commands work with any provider without knowing which one.

### `lib/` Folder - Shared Utilities

**Purpose:** Contains reusable utilities used across the entire CLI.

**What it does:**

- Manages configuration (project configs, provider settings)
- Handles secret injection into environment variables
- Provides secure credential storage via system keyring
- Offers consistent error logging and user input helpers

**Key principle:** Single source of truth for common operations. Used by commands, providers, and UI components.

### `ui/` Folder - Terminal UI Components

**Purpose:** Contains React components that render in the terminal using Ink.

**What it does:**

- Provides interactive UI for commands
- Shows loading states and progress
- Displays data in tables and formatted views
- Handles user selections and confirmations

---

## Detailed File Explanations

### `cmd/` Folder Files

#### `cmd/index.ts` - Command Registry

Central registry where all commands are registered.

```typescript
export function registerCommands(program: Command) {
    registerLoginCommand(program);
    registerConfigureCommand(program);
    registerRunCommand(program);
    registerListCommand(program);
    registerCreateCommand(program);
    registerUpdateCommand(program);
    registerDeleteCommand(program);
}
```

**How it works:**

- `src/cli.ts` calls this on startup
- All commands become available to users
- To add a command: create file in `cmd/`, import and register here

#### `cmd/login.ts` - Login Command Example

Complete example showing how commands work:

```typescript
export function registerLoginCommand(program: Command) {
    program
        .command("login")
        .option("-p, --provider <name>", "Provider name")
        .option("-f, --force", "Force re-authentication")
        .action(async (options) => {
            // 1. Determine provider
            const providerName = options.provider || "enkryptify";

            // 2. Get provider from registry
            const provider = providerRegistry.get(providerName);
            if (!provider) {
                logError(`Provider "${providerName}" not found`);
                process.exit(1);
            }

            // 3. Show UI flow (which calls provider.login internally)
            await LoginFlow({ provider, options });
        });
}
```

**Pattern:** Validate → Get Provider → Delegate → Handle Errors

#### Other Command Files

All commands follow the same pattern:

- `cmd/configure.ts` - Gets provider → calls `provider.configure()` → saves config
- `cmd/run.ts` - Finds config → gets provider → calls `provider.run()` → injects secrets → executes command
- `cmd/list.ts` - Finds config → gets provider → calls `provider.listSecrets()` → displays table
- `cmd/create.ts` - Finds config → gets provider → calls `provider.createSecret()`
- `cmd/update.ts` - Finds config → gets provider → calls `provider.updateSecret()`
- `cmd/delete.ts` - Finds config → gets provider → calls `provider.deleteSecret()`

---

### `providers/` Folder Files

#### `providers/base/Provider.ts` - Provider Interface

**This is the main interface that ALL providers must implement.**

The Provider interface defines methods for:

1. **Authentication** - `login()` - delegates to AuthProvider
2. **Project Setup** - `configure()` - guides user through workspace/project/environment selection
3. **Secret CRUD Operations**:
    - `listSecrets()` - List all secrets (with optional value display)
    - `createSecret()` - Create a new secret
    - `updateSecret()` - Update an existing secret
    - `deleteSecret()` - Delete a secret
4. **Secret Injection** - `run()` - Fetch secrets and return them for injection

```typescript
export interface Provider {
    readonly name: string;

    // Authentication (delegates to AuthProvider)
    login(options?: LoginOptions): Promise<void>;

    // Project configuration
    configure(options: string): Promise<ProjectConfig>;

    // Secret CRUD operations
    listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]>;
    createSecret(config: ProjectConfig, name: string, value: string): Promise<void>;
    updateSecret(config: ProjectConfig, name: string, isPersonal?: boolean): Promise<void>;
    deleteSecret(config: ProjectConfig, name: string): Promise<void>;

    // Secret injection (fetch secrets for running commands)
    run(config: ProviderConfig, options?: runOptions): Promise<Secret[]>;
}
```

**Key Points:**

- Provider handles ALL secret management operations
- Provider.login() is just a delegation method - it calls AuthProvider.login()
- Commands use this interface, so they work with any provider

#### `providers/base/AuthProvider.ts` - Authentication Interface

**AuthProvider is ONLY responsible for authentication and credential storage.**

It does NOT handle secrets. It only:

1. **Login** - `login()` - Handles OAuth flow, token exchange, etc.
2. **Get Credentials** - `getCredentials()` - Retrieves stored tokens/credentials

```typescript
export interface AuthProvider {
    // Handle authentication flow (OAuth, PKCE, etc.)
    login(options?: LoginOptions): Promise<void>;

    // Retrieve stored credentials (tokens, API keys, etc.)
    getCredentials(): Promise<Credentials>;
}
```

**Key Points:**

- AuthProvider ONLY handles login and credential storage
- AuthProvider does NOT know about secrets
- Provider makes HTTP requests - HTTP client interceptor automatically gets token from keyring and adds to request headers
- `auth.getCredentials()` exists but is rarely needed - HTTP client handles it automatically
- Separation of concerns: Auth = AuthProvider, Secrets = Provider

#### How Provider and AuthProvider Work Together

```typescript
export class EnkryptifyProvider implements Provider {
    private auth: EnkryptifyAuth; // AuthProvider instance

    constructor() {
        this.auth = new EnkryptifyAuth();
    }

    // Provider.login() just delegates to AuthProvider
    async login(options?: LoginOptions): Promise<void> {
        await this.auth.login(options);
        // AuthProvider handles:
        // - OAuth PKCE flow
        // - Browser opening
        // - Token exchange
        // - Storing credentials in keyring
    }

    // Provider methods make HTTP requests
    // HTTP client interceptor automatically gets token from keyring and adds to headers
    async run(config: ProjectConfig, options?: runOptions): Promise<Secret[]> {
        // HTTP client automatically injects token via interceptor
        // No need to manually call auth.getCredentials()
        const response = await http.get("/v1/secrets");

        // Transform and return secrets
        return transformSecrets(response.data);
    }

    // Same pattern for other methods
    // HTTP client handles authentication automatically
    async listSecrets(config: ProjectConfig): Promise<Secret[]> {
        const response = await http.get("/v1/secrets");
        // Transform and return...
    }

    async createSecret(config: ProjectConfig, name: string, value: string): Promise<void> {
        await http.post("/v1/secrets", { name, value });
        // HTTP client automatically adds auth token
    }
}
```

**Flow:**

1. User runs `ek login`
2. Command calls `LoginFlow({ provider })` - shows UI
3. UI component calls `provider.login()`
4. Provider delegates to `authProvider.login()` - handles OAuth, stores credentials in keyring
5. User runs `ek run npm start`
6. Command calls `provider.run()`
7. Provider makes HTTP request - HTTP client interceptor automatically gets token from keyring and adds to headers
8. Provider returns secrets
9. Command injects secrets and runs user's command

#### `providers/registry/ProviderRegistry.ts` - Provider Storage

Central registry that stores and retrieves providers.

```typescript
export class ProviderRegistry {
    private providers: Map<string, Provider> = new Map();

    register(provider: Provider): void {
        this.providers.set(provider.name, provider);
    }

    get(name: string): Provider | undefined {
        return this.providers.get(name);
    }

    list(): Provider[] {
        return Array.from(this.providers.values());
    }

    has(name: string): boolean {
        return this.providers.has(name);
    }
}

export const providerRegistry = new ProviderRegistry();
```

**How it works:**

- Singleton instance shared across application
- Providers register on startup in `providers/registry/index.ts`
- Commands look up providers by name

**`providers/registry/index.ts` - Registration Point**

```typescript
import { EnkryptifyProvider } from "@/providers/enkryptfiy/provider";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";

// Register all providers here
providerRegistry.register(new EnkryptifyProvider());
// Future: providerRegistry.register(new AwsProvider());

export { providerRegistry };
```

**To add a new provider:**

1. Create provider class implementing `Provider` interface
2. Create AuthProvider class implementing `AuthProvider` interface
3. **Create login UI component** in `ui/` folder (e.g., `ui/YourProviderLogin.tsx`)
4. **Register UI component** in `ui/LoginFlow.tsx` (add case in switch statement)
5. Import and register provider in `providers/registry/index.ts`
6. Done! Commands automatically work with new provider

**Important:** You MUST create and register a login UI component. Without it, the login command will show "Unknown provider" error.

---

### `lib/` Folder Files

#### `lib/config.ts` - Configuration Management

Manages all configuration (project configs and provider settings) in `~/.enkryptify/config.json`.

**Available Methods:**

```typescript
export const config = {
    // Project configuration
    findProjectConfig(startPath: string): Promise<ProjectConfig>
    // Walks up directory tree to find project config

    getConfigure(projectPath: string): Promise<ProjectConfig | null>
    // Gets exact project config

    createConfigure(projectPath: string, projectConfig: ProjectConfig): Promise<void>
    // Saves project configuration

    // Provider settings
    getProvider(providerName: string): Promise<Record<string, string> | null>
    // Gets provider settings

    updateProvider(providerName: string, settings: Record<string, string>): Promise<void>
    // Updates provider settings
};
```

#### `lib/inject.ts` - Secret Injection

Safely injects secrets as environment variables.

```typescript
export function buildEnvWithSecrets(secrets: Secret[]): typeof process.env {
    const env = { ...process.env };

    for (const secret of secrets) {
        // Protect dangerous env vars (PATH, LD_PRELOAD, etc.)
        if (isDangerousEnvVar(secret.name)) {
            console.warn(`Warning: ${secret.name} is protected`);
            continue;
        }
        env[secret.name] = secret.value;
    }

    return env;
}
```

**Features:**

- Merges secrets into environment variables
- Protects dangerous vars from override
- Validates secret names

#### `lib/keyring.ts` - Secure Credential Storage

Provides secure storage using OS keyring.

```typescript
export const keyring = {
    set(key: string, value: string): Promise<void>,
    get(key: string): Promise<string | null>,
    delete(key: string): Promise<void>,
    has(key: string): Promise<boolean>,
};
```

**Security:**

- Uses OS keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Credentials never in plain text files
- Service name: `"enkryptify-cli"`

#### Other `lib/` Files

- `lib/error.ts` - Consistent error logging (`logError()`)
- `lib/input.ts` - User input helpers (`getTextInput()`, `getSecureInput()`)
- `lib/terminal.ts` - Terminal utilities (`setupTerminalCleanup()`)

---

### `ui/` Folder Files

#### How Ink Works

Ink is React for the terminal. Uses React patterns but renders to terminal:

- `<Box>` = layout container
- `<Text>` = text display
- No CSS - use props like `padding`, `color`, etc.

#### `ui/LoginFlow.tsx` - Login Flow Orchestrator

Orchestrates login UI and routes to provider-specific components.

```typescript
import { EnkryptifyLogin } from "./EnkryptifyLogin";
import { AwsLogin } from "./AwsLogin";
import { YourProviderLogin } from "./YourProviderLogin";  // Import your component

function LoginFlowComponent({ provider, options, onError, onComplete }) {
    const renderProviderComponent = () => {
        switch (provider.name) {
            case "enkryptify":
                return <EnkryptifyLogin provider={provider} options={options} onError={onError} onComplete={onComplete} />;
            case "aws":
                return <AwsLogin provider={provider} options={options} onError={onError} onComplete={onComplete} />;
            case "yourprovider":  // Add your provider case
                return <YourProviderLogin provider={provider} options={options} onError={onError} onComplete={onComplete} />;
            default:
                return <Text>Unknown provider: {provider.name}</Text>;
        }
    };

    return <Box>{renderProviderComponent()}</Box>;
}
```

**Important:** When adding a new provider, you MUST:

1. Create a login UI component (e.g., `ui/YourProviderLogin.tsx`)
2. Import it in `ui/LoginFlow.tsx`
3. Add a case in the switch statement for your provider name

#### `ui/EnkryptifyLogin.tsx` - Provider-Specific Login UI

Shows loading state and calls provider.login().

```typescript
export function EnkryptifyLogin({ provider, onComplete, onError }) {
    const [status, setStatus] = useState("loading");

    useEffect(() => {
        const performLogin = async () => {
            try {
                setMessage("Authenticating...");
                await provider.login(options);  // Calls Provider.login()
                setStatus("success");
                onComplete();
            } catch (error) {
                setStatus("error");
                onError(error);
            }
        };
        void performLogin();
    }, []);

    return (
        <Box>
            {status === "loading" && <Spinner />}
            {status === "success" && <Text>✓ Success</Text>}
            {status === "error" && <Text color="red">Error</Text>}
        </Box>
    );
}
```

---

## How Everything Works Together - Complete Flow

Example: User runs `ek login --provider enkryptify`

```
1. cli.ts
   - Parses command: "login"
   - Routes to registerLoginCommand

2. cmd/login.ts
   - Gets provider from registry: providerRegistry.get("enkryptify")
   - Calls LoginFlow({ provider })

3. ui/LoginFlow.tsx
   - Renders EnkryptifyLogin component

4. ui/EnkryptifyLogin.tsx
   - Shows "Authenticating..." spinner
   - Calls provider.login(options)

5. providers/enkryptfiy/provider.ts
   - Delegates to auth.login(options)

6. providers/enkryptfiy/auth.ts
   - Runs OAuth PKCE flow
   - Opens browser
   - User authenticates
   - Exchanges code for token
   - Stores in keyring via lib/keyring.ts

7. Flow completes
   - UI shows "✓ Success"
   - Command completes
```

---

## Configuration

The CLI stores all configuration in `~/.enkryptify/config.json`.

### Config File Structure

```json
{
    "setups": {
        "/absolute/path/to/project": {
            "provider": "enkryptify",
            "workspace_slug": "workspace-name",
            "workspace_name": "Workspace Name",
            "project_slug": "project-name",
            "project_name": "Project Name",
            "environment_id": "uuid-here"
        }
    },
    "providers": {
        "enkryptify": {}
    }
}
```

- **`setups`**: Maps project directory paths to their configuration
- **`providers`**: Provider-specific settings

The CLI automatically finds the configuration for your current project by walking up the directory tree.

---

## Setup Required Before Using External Providers

### AWS

Before using the AWS provider:

1. **Create AWS Access Key:**
2. **Install AWS CLI:**
    - Install the AWS CLI (https://aws.amazon.com/cli/)

3. **Configure AWS CLI:**
   aws configure
    - Enter your Access Key ID
    - Enter your Secret Access Key
    - Enter your default region (e.g., `us-east-1`)

4. **Verify Setup:**

    ek login --provider aws
    This verifies your AWS setup is correct. If successful, proceed to configure your project.

5. **Configure Your Project:**

    ek configure --provider aws

### Google Cloud Platform (GCP)

Before using the GCP provider:

1. **Install Google Cloud SDK:**
    - Install the Google Cloud SDK (https://cloud.google.com/sdk/docs/install)

2. **Initialize Your Project:**

    gcloud init
    - Login and select the project you want to use for fetch and CRUD operations

3. **Authenticate:**

    gcloud auth application-default login 4.

4. **Verify Setup:**
   ek login --provider gcp
   This verifies your GCP setup is correct. If successful, proceed to configure your project.

5. **Configure Your Project:**
   ek configure --provider gcp

### Enkryptify

No setup required. Simply run:

ek login
ek configure

## Commands

**Note:** For Enkryptify, you don't need to specify `--provider` for the login and configure commands . Only use `--provider` when using other providers like AWS or GCP.

### `ek login [--provider <name>] [--force]`

Authenticate with a secret management provider.

**Options:**

- `--provider, -p <name>` - Provider name (defaults to 'enkryptify')
- `--force, -f` - Force re-authentication even if already logged in

**Examples:**

```bash
ek login
ek login --provider enkryptify
ek login --force  # Re-authenticate
```

### `ek configure [provider]`

Configure your project to use a specific provider and environment.

**Examples:**

```bash
ek configure
ek configure enkryptify
```

### `ek run  [--env <environment>] -- <command> `

**Provider-specific behavior for `--env`:**

- **Enkryptify:** Environment name (e.g., `production`, `staging`)
- **Google Cloud Platform:** Project ID
- **AWS:** Secrets Manager prefix

    Run a command with secrets injected as environment variables.

**Options:**

- `--env, -e <name>` - Environment name to use (overrides default from config) for this run only.

**Note:** The `--` separator is **optional**. You can run commands directly without it. Only use `--` if you have flags that might conflict with the CLI's options.

**Examples:**

```bash
ek run npm start
ek run python app.py
ek run --env production --  npm run deploy
ek run -- pnpm run dev  # -- is optional
ek run --env production pnpm dev run

```

### `ek list [--show]`

List all secrets in the current environment.

**Options:**

- `--show, -s` - Show secret values (default: masked)

**Examples:**

```bash
ek list
ek list --show  # Show actual values
```

### `ek create <name> [value]`

Create a new secret in the current environment.

**Arguments:**

- `<name>` - Secret name (required) - can only contain A-Z, a-z, 0-9, underscore (\_), and hyphen (-)
- `[value]` - Secret value (optional, will prompt if not provided) use "" for complex values

**Examples:**

```bash
ek create API_KEY  # Will prompt for value
```

### `ek update <name> [--ispersonal]`

**Note:** The `--ispersonal` option is only available for the Enkryptify provider.

Update an existing secret.

**Arguments:**

- `<name>` - Secret name to update

**Options:**

- `--ispersonal` - Mark as personal secret (overrides team secret)

    **Note:** The `--ispersonal` option is only available for the Enkryptify provider.

**Examples:**

```bash
ek update DATABASE_URL
ek update API_KEY --ispersonal

```

### `ek delete <name>`

Delete a secret.

**Arguments:**

- `<name>` - Secret name to delete

**Examples:**

```bash
ek delete OLD_SECRET
```
