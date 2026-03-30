import { config } from "@/lib/config";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSdkToken } from "@/lib/sdkToken";
import { writeStdout } from "@/lib/stdout";
import type { Command } from "commander";

export function registerSdkCommand(program: Command): void {
    program
        .command("sdk")
        .description("Run a command with a read-only Enkryptify SDK token, or print the token to stdout.")
        .option("-o, --output <mode>", 'Token delivery mode: "env" (default) injects as ENKRYPTIFY_TOKEN, "stdout" prints the raw token', "env")
        .allowUnknownOption()
        .allowExcessArguments()
        .action(async (options: { output: string }, cmd: Command) => {
            const tracker = analytics.trackCommand("command_sdk");

            if (options.output !== "env" && options.output !== "stdout") {
                tracker.error(new Error("Invalid output mode"));
                logger.error(`Invalid output mode "${options.output}".`, {
                    fix: 'Use --output env (default) or --output stdout.',
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

            if (!setup?.workspace_slug || !setup?.environment_id) {
                tracker.error(new Error("No project configured"));
                logger.error("No project configured in this directory.", {
                    fix: 'Run "ek configure" to set up your project first.',
                    docs: "/cli/troubleshooting#configuration",
                });
                process.exit(1);
                return;
            }

            // 2. Create scoped SDK token (read-only, single environment, 8h)
            let token: string;
            try {
                token = await createSdkToken(setup.workspace_slug, setup.environment_id);
            } catch (error) {
                tracker.error(error);
                if (error instanceof CLIError) {
                    logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                } else {
                    logger.error(error instanceof Error ? error.message : String(error));
                }
                process.exit(1);
            }

            // 3. Stdout mode: print token and exit
            if (options.output === "stdout") {
                await writeStdout(process.stdout.isTTY ? `${token}\n` : token);
                tracker.success({ workspace_slug: setup.workspace_slug });
                process.exit(0);
            }

            // 4. Env mode (default): require command args, spawn subprocess
            const args = cmd.args as string[];
            if (args.length === 0) {
                tracker.error(new Error("No command provided"));
                logger.error("No command provided.", {
                    fix: "Usage: ek sdk -- <command>  or  ek sdk --output stdout",
                });
                process.exit(1);
            }

            const [bin, ...rest] = args;
            if (!bin) {
                tracker.error(new Error("No command provided"));
                logger.error("No command provided.", {
                    fix: "Usage: ek sdk -- <command>  or  ek sdk --output stdout",
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
            tracker.success({ workspace_slug: setup.workspace_slug });
            process.exit(exitCode);
        });
}
