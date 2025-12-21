# Contributing to Enkryptify CLI

Thank you for your interest in contributing to Enkryptify CLI! This guide will help you understand the codebase and contribute effectively.

## Table of Contents

- [Getting Started](#getting-started)
- [Project Architecture](#project-architecture)
- [Adding a New Provider](#adding-a-new-provider)
- [Adding a New Command](#adding-a-new-command)
- [Coding Standards](#coding-standards)
- [Git Workflow](#git-workflow)

## Getting Started

### Prerequisites

- **Bun** (latest version) - [Installation Guide](https://bun.sh/docs/installation)
- **Git**

### Development Setup

1. **Fork and Clone:**

    ```bash
    git clone https://github.com/your-username/cli.git
    cd cli
    ```

2. **Install Dependencies:**

    ```bash
    bun install
    ```

3. **Run the CLI Locally:**

    ```bash
    bun run src/cli.ts --help
    ```

4. **Run Linting:**
    ```bash
    bun run lint
    bun run format
    ```

## Project Architecture

### Folder Structure

```
src/
├── cmd/              # CLI command handlers
│   ├── index.ts      # Command registry (registers all commands)
│   ├── login.ts      # Login command
│   ├── configure.ts  # Configure command
│   └── ...
├── providers/        # Provider implementations
│   ├── base/         # Interfaces (Provider, AuthProvider)
│   ├── registry/     # Provider registry
│   ├── aws/          # AWS provider
│   ├── gcp/          # GCP provider
│   └── enkryptify/   # Enkryptify provider
├── lib/              # Shared utilities
│   ├── config.ts     # Configuration management
│   ├── keyring.ts    # Secure storage
│   └── ...
└── ui/               # Ink UI components
    ├── LoginFlow.tsx # Main login flow
    ├── AwsLogin.tsx  # AWS-specific login UI
    └── ...
```

### Key Concepts

- **Commands**: Thin coordinators that delegate to providers
- **Providers**: Implement business logic for each secret management service
- **Registry Pattern**: Providers are registered and retrieved by name
- **UI Components**: Ink-based React components for interactive flows

## Adding a New Provider

This section explains how to add support for a new secret management provider. We'll use **Enkryptify** as a real example from the codebase.

### Provider Structure

Each provider must follow this structure:

```
src/providers/
└── <provider-name>/          # Folder name = provider name (e.g., "enkryptify", "aws", "gcp")
    ├── auth.ts              # Required: Authentication logic
    └── provider.ts           # Required: Provider implementation
    └── httpClient.ts         # Optional: HTTP client (if needed)
```

**Important Rules:**

- **Folder name** must match the provider name (e.g., `enkryptify`, `aws`, `gcp`)
- **Two required files:** `auth.ts` and `provider.ts` must be in the provider folder
- **Optional file:** `httpClient.ts` (only if you need HTTP client functionality)

### Example: Enkryptify Provider

Let's look at the Enkryptify provider as a working example. The folder structure is:

```
src/providers/
└── enkryptify/
    ├── auth.ts
    ├── provider.ts
    └── httpClient.ts
```

### Step 1: Create Provider Directory

Create a new folder in `src/providers/` with the provider name:

```bash
mkdir src/providers/enkryptify
```

**Note:** The folder name (`enkryptify`) will be used as the provider identifier throughout the codebase.

### Step 2: Create Auth Provider (Required File #1)

Create `src/providers/enkryptify/auth.ts` - this is the first required file. Here's the Enkryptify example:

```typescript
import { config as configManager } from "@/lib/config";
import { keyring } from "@/lib/keyring";
import type { AuthProvider, Credentials, LoginOptions } from "@/providers/base/AuthProvider";
import http from "@/providers/enkryptify/httpClient";

type StoredAuthData = {
    accessToken: string;
    userId: string;
    email: string;
};

export class EnkryptifyAuth implements AuthProvider {
    private readonly PROVIDER_NAME = "enkryptify";

    async login(_options?: LoginOptions): Promise<void> {
        // Implement your authentication logic
        // Example: OAuth flow, API key validation, etc.

        // Store auth state
        await configManager.updateProvider(this.PROVIDER_NAME, {});
    }

    async getCredentials(): Promise<Credentials> {
        // Retrieve and return credentials from keyring
        const authDataString = await keyring.get("enkryptify");
        if (!authDataString) {
            throw new Error("Not authenticated");
        }

        const authData = JSON.parse(authDataString) as StoredAuthData;
        return {
            accessToken: authData.accessToken,
        };
    }
}
```

### Step 3: Create HTTP Client (if needed)

**Optional:** If your provider needs HTTP client functionality, create `src/providers/enkryptify/httpClient.ts`. Here's the Enkryptify example:

```typescript
import { env } from "@/env";
import { createAuthenticatedHttpClient } from "@/lib/sharedHttpClient";

const http = createAuthenticatedHttpClient({
    baseURL: env.API_BASE_URL,
    keyringKey: "enkryptify",
    authHeaderName: "X-API-Key",
    // No authHeaderPrefix - token is used directly
});

export default http;
```

### Step 4: Implement Provider Interface (Required File #2)

Create `src/providers/enkryptify/provider.ts` - this is the second required file. Here's a simplified version of the Enkryptify provider:

```typescript
import { type ProjectConfig, config } from "@/lib/config";
import type { LoginOptions } from "@/providers/base/AuthProvider";
import type { Provider, Secret, runOptions } from "@/providers/base/Provider";
import { EnkryptifyAuth } from "@/providers/enkryptify/auth";
import http from "@/providers/enkryptify/httpClient";

export class EnkryptifyProvider implements Provider {
    private auth: EnkryptifyAuth;
    readonly name = "enkryptify";

    constructor() {
        this.auth = new EnkryptifyAuth();
    }

    async login(options?: LoginOptions): Promise<void> {
        await this.auth.login(options);
    }

    async configure(options: string): Promise<ProjectConfig> {
        // Guide user through configuration
        // Example: Select workspace, project, environment

        return {
            path: options,
            provider: this.name,
            workspace_slug: "selected-workspace",
            project_slug: "selected-project",
            environment_id: "selected-environment-id",
        };
    }

    async run(config: ProjectConfig, options?: runOptions): Promise<Secret[]> {
        // Fetch secrets from your provider's API
        const response = await http.get("/v1/secrets", {
            params: { environment_id: config.environment_id },
        });

        // Transform API response to Secret[] format
        return response.data.map((secret: any) => ({
            name: secret.name,
            value: secret.value,
            // ... other fields
        }));
    }

    async createSecret(config: ProjectConfig, name: string, value: string): Promise<void> {
        await http.post("/v1/secrets", {
            name,
            value,
            environment_id: config.environment_id,
        });
    }

    async updateSecret(config: ProjectConfig, name: string, isPersonal?: boolean): Promise<void> {
        // Implement update logic
    }

    async deleteSecret(config: ProjectConfig, name: string): Promise<void> {
        await http.delete(`/v1/secrets/${name}`);
    }

    async listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]> {
        // Fetch and return list of secrets
        const response = await http.get("/v1/secrets", {
            params: { environment_id: config.environment_id },
        });

        return response.data.map((secret: any) => ({
            name: secret.name,
            value: showValues === "show" ? secret.value : "*********",
        }));
    }
}
```

### Step 5: Register Provider

Add to `src/providers/registry/index.ts`:

```typescript
import { EnkryptifyProvider } from "@/providers/enkryptify/provider";
// ... other imports

providerRegistry.register(new EnkryptifyProvider());
```

### Step 6: Create Login UI Component

Create `src/ui/EnkryptifyLogin.tsx`. Here's the real example:

```typescript
import type { LoginOptions } from "@/providers/base/AuthProvider";
import type { Provider } from "@/providers/base/Provider";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";

export interface EnkryptifyLoginProps {
    provider: Provider;
    options?: LoginOptions;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

export function EnkryptifyLogin({ provider, options, onError, onComplete }: EnkryptifyLoginProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        const performLogin = async () => {
            try {
                setMessage(`Authenticating with ${provider.name}...`);
                await provider.login(options);
                setStatus("success");
                setMessage(`✓ Successfully authenticated with ${provider.name}`);

                setTimeout(() => {
                    onComplete?.();
                }, 1000);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                setStatus("error");
                setMessage(`⚠️  ${err.message}`);
                onError?.(err);
            }
        };

        void performLogin();
    }, [provider, options]);

    return (
        <Box flexDirection="column">
            {status === "loading" && (
                <Box flexDirection="row" alignItems="center" gap={1}>
                    <Text>
                        <Spinner type="dots" />
                    </Text>
                    <Text bold>{message}</Text>
                </Box>
            )}

            {status === "success" && (
                <Box marginTop={1}>
                    <Text bold>{message}</Text>
                </Box>
            )}

            {status === "error" && (
                <Box marginTop={1}>
                    <Text bold color="red">
                        {message}
                    </Text>
                </Box>
            )}
        </Box>
    );
}
```

### Step 7: Add to Login Flow

Update `src/ui/LoginFlow.tsx`:

1. **Import your component:**

    ```typescript
    import { EnkryptifyLogin } from "./EnkryptifyLogin";
    ```

2. **Add to knownProviders array (line 18):**

    ```typescript
    const knownProviders = ["enkryptify", "aws", "gcp"];
    ```

3. **Add case in switch statement (line 24-41):**
    ```typescript
    case "enkryptify":
        return (
            <EnkryptifyLogin provider={provider} options={options} onError={onError} onComplete={onComplete} />
        );
    ```

### Step 8: Update Documentation

Add setup instructions to `README.md` in the "Setup Required Before Using External Providers" section.

### Step 9: Test Your Provider

Test all functionality:

- Login flow
- Configure flow
- Run command (secret injection)
- List secrets
- Create/update/delete secrets

## Adding a New Command

This section explains how to add a new CLI command (e.g., `ek backup`, `ek sync`).

### Step 1: Create Command File

Create `src/cmd/backup.ts`:

```typescript
import { config } from "@/lib/config";
import { logError } from "@/lib/error";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import type { Command } from "commander";

export async function backupCommand(): Promise<void> {
    // 1. Get project config
    const projectConfig = await config.findProjectConfig(process.cwd());

    // 2. Get provider
    const provider = providerRegistry.get(projectConfig.provider);
    if (!provider) {
        throw new Error(`Provider "${projectConfig.provider}" not found`);
    }

    // 3. Implement backup logic
    // Example: Export secrets to a file
}

export function registerBackupCommand(program: Command) {
    program
        .command("backup")
        .description("Backup secrets from the current environment")
        .action(async () => {
            try {
                await backupCommand();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
```

### Step 2: Register Command

Add to `src/cmd/index.ts`:

```typescript
import { registerBackupCommand } from "@/cmd/backup";
// ... other imports

export function registerCommands(program: Command) {
    registerLoginCommand(program);
    registerConfigureCommand(program);
    registerRunCommand(program);
    registerListCommand(program);
    registerCreateCommand(program);
    registerDeleteCommand(program);
    registerUpdateCommand(program);
    registerBackupCommand(program); // Add your command
}
```

### Step 3: Test Your Command

```bash
bun src/cli.ts backup --help
bun src/cli.ts backup
```

## Coding Standards

### Code Style

- **Prettier** for formatting - run `bun run format` before committing
- **ESLint** for linting - run `bun run lint:fix` to auto-fix

### TypeScript Guidelines

- Use **strict TypeScript** - all types must be explicit
- Prefer `type` over `interface` for object shapes
- Use path aliases (`@/`) for imports
- No `any` types - use `unknown` if type is truly unknown

### Naming Conventions

- **Files:** `camelCase.ts` (e.g., `listCommand.ts`)
- **Functions:** `camelCase` (e.g., `registerLoginCommand`)
- **Classes:** `PascalCase` (e.g., `AwsProvider`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`)

### Error Handling

- Use `logError()` from `src/lib/error.ts` for user-facing errors
- Throw descriptive errors with context
- Always handle async errors with try/catch
- Exit with appropriate codes: `process.exit(1)` for errors, `process.exit(0)` for success

### Example Command Pattern

All commands follow this pattern:

```typescript
export async function myCommandFunction(...args): Promise<void> {
    // 1. Validate inputs
    // 2. Get project config (if needed)
    // 3. Get provider (if needed)
    // 4. Implement logic
    // 5. Handle errors
}

export function registerMyCommand(program: Command) {
    program
        .command("mycommand")
        .description("Description of what the command does")
        .argument("<arg>", "Argument description")
        .option("-f, --flag", "Option description")
        .action(async (arg, opts) => {
            try {
                await myCommandFunction(arg, opts);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
```

## Git Workflow

### Branch Naming

- `feature/description` - New features (e.g., `feature/vault-provider`)
- `fix/description` - Bug fixes (e.g., `fix/gcp-auth-error`)
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

### Commit Messages

Follow conventional commits:

```
type(scope): description

[optional body]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

**Examples:**

```
feat(vault): add HashiCorp Vault provider support
fix(gcp): handle project names with forward slashes
docs(readme): add provider setup instructions
refactor(http): extract shared HTTP client logic
```

### Pull Request Process

1. **Create an Issue First** (for significant changes)
    - Discuss the approach
    - Get feedback before implementing

2. **Create a Branch:**

    ```bash
    git checkout -b feature/your-feature-name
    ```

3. **Make Your Changes:**
    - Write clean, tested code
    - Follow coding standards
    - Update documentation

4. **Test Your Changes:**

    ```bash
    bun run lint
    bun run format:check
    # Test your feature manually
    ```

5. **Commit:**

    ```bash
    git commit -m "feat(scope): your description"
    ```

6. **Push and Create PR:**

    ```bash
    git push origin feature/your-feature-name
    ```

    - Create PR with clear description
    - Reference related issues
    - Add screenshots for UI changes

## Security Considerations

- **Never log secrets or credentials**
- Use `keyring` from `src/lib/keyring.ts` for secure storage
- Validate all user inputs
- Follow security best practices for secret injection
- Be careful with environment variable injection (see `src/lib/inject.ts`)

## Questions?

- Open an issue for questions
- Check existing issues/PRs for discussions
- Be respectful and constructive

Thank you for contributing! 🎉
