import { type ProjectConfig, config } from "@/lib/config";
import { logError } from "@/lib/error";
import type { Secret } from "@/providers/base/Provider";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { RunFlow } from "@/ui/RunFlow";
import type { Command } from "commander";

/**
 * Replaces ${VARIABLE_NAME} placeholders in content with secret values
 */
function replaceVariables(content: string, secrets: Secret[]): string {
    // Create a map of secret names to values for O(1) lookup
    const secretMap = new Map<string, string>();
    for (const secret of secrets) {
        if (secret.name && secret.value != null) {
            secretMap.set(secret.name, secret.value);
        }
    }

    // Replace ${VARIABLE_NAME} patterns
    // Variable names must start with a letter or underscore, followed by letters, digits, or underscores
    return content.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, varName) => {
        const value = secretMap.get(varName);
        if (value !== undefined) {
            return value;
        }
        // If variable not found in secrets, leave it unchanged
        process.stderr.write(`Warning: Variable "${varName}" not found in secrets, leaving unchanged.\n`);
        return match;
    });
}

export async function runTomlCommand(
    projectConfig: ProjectConfig,
    filePath: string,
    options?: { env?: string; unmountSpinner?: () => void },
): Promise<void> {
    const provider = providerRegistry.get(projectConfig.provider);
    if (!provider) {
        const availableProviders = providerRegistry
            .list()
            .map((p) => p.name)
            .join(", ");
        throw new Error(`Provider "${projectConfig.provider}" not found. Available providers: ${availableProviders}`);
    }

    // Fetch secrets from provider
    const secrets = await provider.run(projectConfig, { env: options?.env });

    // Unmount spinner right after secrets are fetched
    if (options?.unmountSpinner) {
        options.unmountSpinner();
    }

    // Print success message to stderr (not stdout, to avoid polluting TOML output)
    const successMessage = options?.env
        ? `Secrets loaded successfully for environment "${options.env}".\n`
        : "Secrets loaded successfully.\n";
    process.stderr.write(successMessage);

    // Read the TOML file
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
        throw new Error(`File not found: ${filePath}`);
    }

    const content = await file.text();

    // Replace variables with secret values
    const processedContent = replaceVariables(content, secrets);

    // Output to stdout (important for process substitution)
    process.stdout.write(processedContent);
}

export function registerRunTomlCommand(program: Command) {
    program
        .command("run-toml")
        .description("Process a TOML file by replacing ${VARIABLE} placeholders with secrets from the provider.")
        .requiredOption("-f, --file <path>", "Path to the TOML file to process")
        .option("-e, --env <environmentName>", "Environment name to use (overrides default from config)")
        .action(async (opts: { file: string; env?: string }) => {
            try {
                const projectConfig: ProjectConfig = await config.findProjectConfig(process.cwd());

                await RunFlow({
                    envName: opts.env,
                    run: async (unmountSpinner) => {
                        await runTomlCommand(projectConfig, opts.file, {
                            env: opts.env,
                            unmountSpinner,
                        });
                    },
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
