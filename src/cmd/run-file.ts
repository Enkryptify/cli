import { type ProjectConfig, config } from "@/lib/config";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { isDangerousEnvVar } from "@/lib/inject";
import { logger } from "@/lib/logger";
import { writeStdout } from "@/lib/stdout";
import { type Secret, client } from "@/api/client";
import { fetchSecretsWithCache } from "@/lib/secretCache";
import { RunFlow } from "@/ui/RunFlow";
import type { Command } from "commander";

export function replaceVariables(
    content: string,
    secrets: Secret[],
    options?: { allowDangerousVars?: boolean },
): string {
    const secretMap = new Map<string, string>();
    for (const secret of secrets) {
        if (secret.name && secret.value != null) {
            secretMap.set(secret.name, secret.value);
        }
    }

    return content.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, varName: string) => {
        const value = secretMap.get(varName);
        if (value !== undefined) {
            if (!options?.allowDangerousVars && isDangerousEnvVar(varName)) {
                logger.stderr.warn(
                    `Secret "${varName}" matches a protected environment variable name. Use --allow-dangerous-vars to suppress this warning.`,
                );
            }
            return value.replace(/\r/g, "");
        }

        logger.stderr.warn(`Variable "${varName}" was not found in your secrets and will be left unchanged.`);
        return match;
    });
}

export async function runFileCommand(
    projectConfig: ProjectConfig,
    filePath: string,
    options?: {
        env?: string;
        noCache?: boolean;
        offline?: boolean;
        allowDangerousVars?: boolean;
        unmountSpinner?: () => void;
    },
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

    if (fromCache && cacheReason === "fallback_auth") {
        logger.stderr.warn(
            'Authentication failed. Using cached secrets as a fallback. Run "ek login" to re-authenticate.',
        );
    } else if (fromCache && cacheReason === "fallback") {
        logger.stderr.warn(
            "Could not reach the Enkryptify API. Using cached secrets as a fallback. Use --skip-cache to disable.",
        );
    } else if (fromCache) {
        logger.stderr.info("Using cached secrets. Use --skip-cache to force a fresh fetch.");
    }

    // Show connected workspace, project & environment
    const contextParts: string[] = [];
    contextParts.push(`Workspace: ${projectConfig.workspace_slug}`);
    contextParts.push(`Project: ${projectConfig.project_slug}`);
    if (options?.env) {
        contextParts.push(`Environment: ${options.env}`);
    } else if (projectConfig.environment_id) {
        contextParts.push(`Environment: ${projectConfig.environment_id}`);
    }
    logger.stderr.info(contextParts.join(" · "));

    logger.stderr.success("Secrets loaded successfully.");

    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
        throw new CLIError(`File not found: ${filePath}`, undefined, "Check the file path and try again.");
    }

    const content = await file.text();
    const processedContent = replaceVariables(content, secrets, {
        allowDangerousVars: options?.allowDangerousVars,
    });
    await writeStdout(processedContent);
}

export function registerRunFileCommand(program: Command) {
    program
        .command("run-file")
        // eslint-disable-next-line no-template-curly-in-string
        .description("Process a file by replacing ${VARIABLE} placeholders with secrets from Enkryptify.")
        .requiredOption("-f, --file <path>", "Path to the file to process")
        .option("-e, --env <environmentName>", "Environment name to use (overrides default from config)")
        .option("--skip-cache", "Skip cache and always fetch fresh secrets from the API")
        .option("--offline", "Use cached secrets without contacting the API")
        .option(
            "--allow-dangerous-vars",
            "Suppress warnings when substituting protected environment variable names (PATH, NODE_OPTIONS, etc.)",
        )
        .action(
            async (opts: {
                file: string;
                env?: string;
                skipCache?: boolean;
                offline?: boolean;
                allowDangerousVars?: boolean;
            }) => {
                const tracker = analytics.trackCommand("command_run_file", {
                    has_env_flag: !!opts.env,
                    skip_cache: !!opts.skipCache,
                    offline: !!opts.offline,
                });

                try {
                    if (opts.skipCache && opts.offline) {
                        throw CLIError.from("COMMAND_CONFLICTING_FLAGS");
                    }

                    const projectConfig: ProjectConfig = await config.findProjectConfig(process.cwd());

                    await RunFlow({
                        envName: opts.env,
                        run: async (unmountSpinner) => {
                            await runFileCommand(projectConfig, opts.file, {
                                env: opts.env,
                                noCache: opts.skipCache,
                                offline: opts.offline,
                                allowDangerousVars: opts.allowDangerousVars,
                                unmountSpinner,
                            });
                        },
                    });

                    tracker.success({
                        workspace_slug: projectConfig.workspace_slug,
                    });
                    process.exit(0);
                } catch (error) {
                    tracker.error(error);
                    if (error instanceof CLIError) {
                        logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                    } else {
                        logger.error(error instanceof Error ? error.message : String(error));
                    }
                    process.exit(1);
                }
            },
        );
}
