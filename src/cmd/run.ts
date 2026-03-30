import { type ProjectConfig, config } from "@/lib/config";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { buildEnvWithSecrets } from "@/lib/inject";
import { fetchSecretsWithCache } from "@/lib/secretCache";
import { client } from "@/api/client";
import { RunFlow } from "@/ui/RunFlow";
import type { Command } from "commander";

export async function runCommand(
    projectconfig: ProjectConfig,
    cmd: string[],
    options?: {
        env?: string;
        project?: string;
        noCache?: boolean;
        offline?: boolean;
        prefix?: string;
        allowDangerousVars?: boolean;
        unmountSpinner?: () => void;
    },
): Promise<{ fromCache: boolean; cacheReason?: string; exitCode: number }> {
    const { secrets, fromCache, cacheReason } = await fetchSecretsWithCache(
        projectconfig,
        { env: options?.env, project: options?.project },
        { noCache: options?.noCache, offline: options?.offline },
        () => client.run(projectconfig, { env: options?.env, project: options?.project }),
    );
    const { env, injectedCount, skippedSecrets } = buildEnvWithSecrets(secrets, {
        prefix: options?.prefix,
        allowDangerousVars: options?.allowDangerousVars,
    });

    // Unmount spinner right after secrets are fetched, before command runs
    if (options?.unmountSpinner) {
        options.unmountSpinner();
    }

    if (fromCache && cacheReason === "fallback") {
        logger.stderr.warn(
            "Could not reach the Enkryptify API. Using cached secrets as a fallback. Use --skip-cache to disable.",
        );
    } else if (fromCache) {
        logger.stderr.info("Using cached secrets. Use --skip-cache to force a fresh fetch.");
    }

    let successMessage = `${injectedCount} secret${injectedCount !== 1 ? "s" : ""} injected`;
    if (skippedSecrets.length > 0) {
        successMessage += `, ${skippedSecrets.length} skipped (${skippedSecrets.join(", ")})`;
    }
    if (options?.project) {
        successMessage += ` for project "${options.project}"`;
    }
    if (options?.env) {
        successMessage += options?.project ? ` environment "${options.env}"` : ` for environment "${options.env}"`;
    }
    successMessage += ".";
    logger.stderr.success(successMessage);

    if (cmd.length === 0) {
        throw CLIError.from("COMMAND_MISSING");
    }

    const [bin, ...args] = cmd;

    if (!bin) {
        throw CLIError.from("COMMAND_MISSING");
    }

    const proc = Bun.spawn([bin, ...args], {
        env: env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new CLIError(
            `Your command exited with code ${exitCode}.`,
            "The command you ran returned a non-zero exit code, which usually indicates an error.",
        );
    }

    return { fromCache, cacheReason, exitCode };
}

export function registerRunCommand(program: Command) {
    program
        .command("run")
        .description("Run a command with secrets from Enkryptify injected as environment variables.")
        .option("-e, --env <environmentName>", "Environment name to use (overrides default from config)")
        .option("-p, --project <projectName>", "Project name to use (overrides default from config)")
        .option("--skip-cache", "Skip cache and always fetch fresh secrets from the API")
        .option("--offline", "Use cached secrets without contacting the API")
        .option("--prefix <prefix>", "Prefix all injected secret names (e.g., --prefix EK_)")
        .option(
            "--allow-dangerous-vars",
            "Allow secrets to override protected environment variables (PATH, NODE_OPTIONS, etc.)",
        )
        .argument(
            "<cmd...>",
            "Command and arguments to run (e.g. 'pnpm run dev' or use '--' to separate: 'ek run -- pnpm run dev')",
        )
        .action(
            async (
                cmd: string[],
                opts: {
                    env?: string;
                    project?: string;
                    skipCache?: boolean;
                    offline?: boolean;
                    prefix?: string;
                    allowDangerousVars?: boolean;
                },
            ) => {
                const tracker = analytics.trackCommand("command_run", {
                    has_env_flag: !!opts.env,
                    has_project_flag: !!opts.project,
                    skip_cache: !!opts.skipCache,
                    offline: !!opts.offline,
                });

                try {
                    if (opts.project && !opts.env) {
                        throw CLIError.from("ENV_REQUIRED_WITH_PROJECT");
                    }

                    if (opts.skipCache && opts.offline) {
                        throw CLIError.from("COMMAND_CONFLICTING_FLAGS");
                    }

                    const projectConfig: ProjectConfig = await config.findProjectConfig(process.cwd());

                    let result: { fromCache: boolean; cacheReason?: string; exitCode: number } | undefined;

                    await RunFlow({
                        envName: opts.env,
                        projectName: opts.project,
                        run: async (unmountSpinner) => {
                            result = await runCommand(projectConfig, cmd, {
                                env: opts.env,
                                project: opts.project,
                                noCache: opts.skipCache,
                                offline: opts.offline,
                                prefix: opts.prefix,
                                allowDangerousVars: opts.allowDangerousVars,
                                unmountSpinner,
                            });
                        },
                    });

                    tracker.success({
                        workspace_slug: projectConfig.workspace_slug,
                        from_cache: result?.fromCache,
                        cache_reason: result?.cacheReason,
                        exit_code: result?.exitCode ?? 0,
                    });
                    process.exit(result?.exitCode ?? 0);
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
