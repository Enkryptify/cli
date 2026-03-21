import { type ProjectConfig, config } from "@/lib/config";
import { logError } from "@/lib/error";
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
        process.stderr.write(
            "⚠️  Could not reach the API. Using cached secrets as fallback. Use --skip-cache to disable.\n",
        );
    } else if (fromCache) {
        process.stderr.write("⚡ Using cached secrets. Use --skip-cache to force a fresh fetch.\n");
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
    successMessage += ".\n";
    process.stderr.write(successMessage);

    if (cmd.length === 0) {
        throw new Error("Command is required. Please provide a command to run.");
    }

    const [bin, ...args] = cmd;

    if (!bin) {
        throw new Error("Command is required. Please provide a command to run.");
    }

    const proc = Bun.spawn([bin, ...args], {
        env: env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new Error(`Command exited with code ${exitCode}`);
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
                    throw new Error("The --env option is required when using --project.");
                }

                if (opts.skipCache && opts.offline) {
                    throw new Error("--skip-cache and --offline cannot be used together.");
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
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
