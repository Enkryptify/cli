import { config } from "@/lib/config";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { client } from "@/api/client";
import type { Command } from "commander";

export async function updateSecretCommand(name: string, isPersonal?: boolean): Promise<string | undefined> {
    if (!name || !name.trim()) {
        throw CLIError.from("VALIDATION_SECRET_NAME_REQUIRED");
    }

    const projectConfig = await config.findProjectConfig(process.cwd());

    await client.updateSecret(projectConfig, name, isPersonal);

    return projectConfig.workspace_slug;
}

export function registerUpdateCommand(program: Command) {
    program
        .command("update")
        .description("Update a secret in the current environment")
        .argument("<name>", "Secret name (key) to update. Example: ek secret update MySecret")
        .option("--ispersonal", "Make the secret personal")
        .action(async (name: string, opts?: { ispersonal?: boolean }) => {
            const tracker = analytics.trackCommand("command_secret_update", {
                is_personal: !!opts?.ispersonal,
            });

            try {
                const workspaceSlug = await updateSecretCommand(name, opts?.ispersonal);
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
