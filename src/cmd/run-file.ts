import { type ProjectConfig, config } from "@/lib/config";
import { logError } from "@/lib/error";
import type { Secret } from "@/providers/base/Provider";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { RunFlow } from "@/ui/RunFlow";
import type { Command } from "commander";

function replaceVariables(content: string, secrets: Secret[]): string {
    const secretMap = new Map<string, string>();
    for (const secret of secrets) {
        if (secret.name && secret.value != null) {
            secretMap.set(secret.name, secret.value);
        }
    }

    return content.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, varName: string) => {
        const value = secretMap.get(varName);
        if (value !== undefined) {
            return value;
        }

        process.stderr.write(`Warning: Variable "${varName}" not found in secrets, leaving unchanged.\n`);
        return match;
    });
}

export async function runFileCommand(
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

    const secrets = await provider.run(projectConfig, { env: options?.env });
    if (options?.unmountSpinner) {
        options.unmountSpinner();
    }

    const successMessage = options?.env
        ? `Secrets loaded successfully for environment "${options.env}".\n`
        : "Secrets loaded successfully.\n";
    process.stderr.write(successMessage);

    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
        throw new Error(`File not found: ${filePath}`);
    }

    const content = await file.text();
    const processedContent = replaceVariables(content, secrets);
    process.stdout.write(processedContent);
}

export function registerRunFileCommand(program: Command) {
    program
        .command("run-file")
        .description("Process a file by replacing ${VARIABLE} placeholders with secrets from the provider.")
        .requiredOption("-f, --file <path>", "Path to the file to process")
        .option("-e, --env <environmentName>", "Environment name to use (overrides default from config)")
        .action(async (opts: { file: string; env?: string }) => {
            try {
                const projectConfig: ProjectConfig = await config.findProjectConfig(process.cwd());

                await RunFlow({
                    envName: opts.env,
                    run: async (unmountSpinner) => {
                        await runFileCommand(projectConfig, opts.file, {
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
