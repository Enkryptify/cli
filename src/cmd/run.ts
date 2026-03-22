import { type ProjectConfig, config } from "@/lib/config";
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
    options?: { env?: string; project?: string; noCache?: boolean; offline?: boolean; unmountSpinner?: () => void },
): Promise<void> {
    const { secrets, fromCache, cacheReason } = await fetchSecretsWithCache(
        projectconfig,
        { env: options?.env, project: options?.project },
        { noCache: options?.noCache, offline: options?.offline },
        () => client.run(projectconfig, { env: options?.env, project: options?.project }),
    );
    const env = buildEnvWithSecrets(secrets);

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

    let successMessage = "Secrets injected successfully";
    if (options?.project) {
        successMessage += ` for project "${options.project}"`;
    }
    if (options?.env) {
        successMessage += options?.project
            ? ` environment "${options.env}"`
            : ` for environment "${options.env}"`;
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
}

export function registerRunCommand(program: Command) {
    program
        .command("run")
        .description("Run a command with secrets from Enkryptify injected as environment variables.")
        .option("-e, --env <environmentName>", "Environment name to use (overrides default from config)")
        .option("-p, --project <projectName>", "Project name to use (overrides default from config)")
        .option("--skip-cache", "Skip cache and always fetch fresh secrets from the API")
        .option("--offline", "Use cached secrets without contacting the API")
        .argument(
            "<cmd...>",
            "Command and arguments to run (e.g. 'pnpm run dev' or use '--' to separate: 'ek run -- pnpm run dev')",
        )
        .action(async (cmd: string[], opts: { env?: string; project?: string; skipCache?: boolean; offline?: boolean }) => {
            try {
                if (opts.project && !opts.env) {
                    throw CLIError.from("ENV_REQUIRED_WITH_PROJECT");
                }

                if (opts.skipCache && opts.offline) {
                    throw CLIError.from("COMMAND_CONFLICTING_FLAGS");
                }

                const projectConfig: ProjectConfig = await config.findProjectConfig(process.cwd());

                await RunFlow({
                    envName: opts.env,
                    projectName: opts.project,
                    run: async (unmountSpinner) => {
                        await runCommand(projectConfig, cmd, {
                            env: opts.env,
                            project: opts.project,
                            noCache: opts.skipCache,
                            offline: opts.offline,
                            unmountSpinner,
                        });
                    },
                });
            } catch (error) {
                if (error instanceof CLIError) {
                    logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                } else {
                    logger.error(error instanceof Error ? error.message : String(error));
                }
                process.exit(1);
            }
        });
}
