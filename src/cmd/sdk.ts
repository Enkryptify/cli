import { config } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import http from "@/api/httpClient";
import type { Command } from "commander";

export function registerSdkCommand(program: Command): void {
    program
        .command("sdk")
        .description("Run a command with a read-only Enkryptify SDK token")
        .allowUnknownOption()
        .allowExcessArguments()
        .action(async (_options, cmd: Command) => {
            const args = cmd.args as string[];
            if (args.length === 0) {
                logger.error("No command provided.", {
                    fix: "Usage: ek sdk -- <command>",
                });
                process.exit(1);
            }

            // 1. Load project config (walks up from cwd)
            let setup;
            try {
                setup = await config.getConfigure(process.cwd());
            } catch {
                // getConfigure returns null if not found, doesn't throw
            }

            if (!setup) {
                logger.error("No project configured in this directory.", {
                    fix: 'Run "ek configure" to set up your project first.',
                    docs: "/cli/configure",
                });
                process.exit(1);
            }

            // 2. Create scoped SDK token (read-only, single environment, 8h)
            let token: string;
            try {
                const { data } = await http.post<{ token: string }>(
                    `/v1/workspace/${setup.workspace_slug}/tokens/cli`,
                    { environmentId: setup.environment_id },
                );
                token = data.token;
            } catch (error) {
                if (error instanceof CLIError) {
                    logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                } else {
                    logger.error(error instanceof Error ? error.message : String(error));
                }
                process.exit(1);
            }

            // 3. Spawn child process with token injected
            const [bin, ...rest] = args;
            if (!bin) {
                logger.error("No command provided.", {
                    fix: "Usage: ek sdk -- <command>",
                });
                process.exit(1);
            }

            const proc = Bun.spawn([bin, ...rest], {
                env: { ...process.env, ENKRYPTIFY_TOKEN: token },
                stdin: "inherit",
                stdout: "inherit",
                stderr: "inherit",
            });

            const exitCode = await proc.exited;
            process.exit(exitCode);
        });
}
