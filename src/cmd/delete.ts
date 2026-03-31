import { config } from "@/lib/config";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { client } from "@/api/client";
import type { Command } from "commander";

export async function deleteSecretCommand(name: string): Promise<string | undefined> {
    if (!name || !name.trim()) {
        throw CLIError.from("VALIDATION_SECRET_NAME_REQUIRED");
    }

    const projectConfig = await config.findProjectConfig(process.cwd());

    await client.deleteSecret(projectConfig, name);

    return projectConfig.workspace_slug;
}

export function registerDeleteCommand(program: Command) {
    program
        .command("delete")
        .description("The delete command is used to delete a secret from the current environment.")
        .argument("<name>", "Secret name (key) to delete. Example: ek secret delete MySecret")
        .action(async (name: string) => {
            const tracker = analytics.trackCommand("command_secret_delete");

            try {
                const workspaceSlug = await deleteSecretCommand(name);
                tracker.success({ workspace_slug: workspaceSlug });
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
