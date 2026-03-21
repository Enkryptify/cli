import { type ProjectConfig, config } from "@/lib/config";
import { logError } from "@/lib/error";
import { type Secret, client } from "@/api/client";
import { fetchSecretsWithCache } from "@/lib/secretCache";
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
    options?: { env?: string; noCache?: boolean; offline?: boolean; unmountSpinner?: () => void },
): Promise<void> {
    const { secrets, fromCache, cacheReason } = await fetchSecretsWithCache(
        projectConfig,
        { env: options?.env },
        { noCache: options?.noCache, offline: options?.offline },
        () => client.run(projectConfig, { env: options?.env }),
    );
    if (options?.unmountSpinner) {
        options.unmountSpinner();
    }

    if (fromCache && cacheReason === "fallback") {
        process.stderr.write(
            "⚠️  Could not reach the API. Using cached secrets as fallback. Use --skip-cache to disable.\n",
        );
    } else if (fromCache) {
        process.stderr.write("⚡ Using cached secrets. Use --skip-cache to force a fresh fetch.\n");
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
        .description("Process a file by replacing ${VARIABLE} placeholders with secrets from Enkryptify.")
        .requiredOption("-f, --file <path>", "Path to the file to process")
        .option("-e, --env <environmentName>", "Environment name to use (overrides default from config)")
        .option("--skip-cache", "Skip cache and always fetch fresh secrets from the API")
        .option("--offline", "Use cached secrets without contacting the API")
        .action(async (opts: { file: string; env?: string; skipCache?: boolean; offline?: boolean }) => {
            try {
                if (opts.skipCache && opts.offline) {
                    throw new Error("--skip-cache and --offline cannot be used together.");
                }

                const projectConfig: ProjectConfig = await config.findProjectConfig(process.cwd());

                await RunFlow({
                    envName: opts.env,
                    run: async (unmountSpinner) => {
                        await runFileCommand(projectConfig, opts.file, {
                            env: opts.env,
                            noCache: opts.skipCache,
                            offline: opts.offline,
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
