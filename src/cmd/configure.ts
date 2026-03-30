import { config } from "@/lib/config";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { client } from "@/api/client";
import type { Command } from "commander";

export async function configure(): Promise<Record<string, string>> {
    const authenticated = await config.isAuthenticated();
    if (!authenticated) {
        throw CLIError.from("AUTH_NOT_LOGGED_IN");
    }

    const projectPath = process.cwd();

    const projectConfig = await client.configure(projectPath);

    await config.createConfigure(projectPath, projectConfig);

    return projectConfig;
}

export function registerConfigureCommand(program: Command) {
    program
        .command("configure")
        .alias("setup")
        .description("The configure command is used to set up a project with Enkryptify.")
        .action(async () => {
            const tracker = analytics.trackCommand("command_configure");

            try {
                const projectConfig = await configure();
                tracker.success({
                    workspace_slug: projectConfig.workspace_slug,
                });
            } catch (error) {
                tracker.error(error);
                if (error instanceof CLIError) {
                    logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                } else {
                    logger.error(error instanceof Error ? error.message : String(error));
                }
                process.exit(1);
            }
        });
}
