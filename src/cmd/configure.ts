import { config } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { client } from "@/api/client";
import type { Command } from "commander";

export async function configure(): Promise<void> {
    const authenticated = await config.isAuthenticated();
    if (!authenticated) {
        throw CLIError.from("AUTH_NOT_LOGGED_IN");
    }

    const projectPath = process.cwd();

    const projectConfig = await client.configure(projectPath);

    await config.createConfigure(projectPath, projectConfig);
}

export function registerConfigureCommand(program: Command) {
    program
        .command("configure")
        .alias("setup")
        .description("The configure command is used to set up a project with Enkryptify.")
        .action(async () => {
            try {
                await configure();
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
