import { config } from "@/lib/config";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { client } from "@/api/client";
import { showSecretsTable } from "@/ui/SecretsTable";
import { type Command } from "commander";

export async function listSecretsCommand(mode: "show" | "hide"): Promise<{ count: number; workspaceSlug?: string }> {
    const projectConfig = await config.findProjectConfig(process.cwd());

    const secrets = await client.listSecrets(projectConfig, mode);
    showSecretsTable(secrets);

    return { count: secrets.length, workspaceSlug: projectConfig.workspace_slug };
}

export function registerListCommand(program: Command) {
    program
        .command("list")
        .description("The list command is used to show the secrets in the current environment.")
        .option("-s, --show", "Show the table with the secrets values (default: masked)")
        .action(async (opts: { show?: boolean }) => {
            const tracker = analytics.trackCommand("command_secret_list", {
                show_values: !!opts.show,
            });

            try {
                const mode: "show" | "hide" = opts.show ? "show" : "hide";

                const result = await listSecretsCommand(mode);
                tracker.success({
                    workspace_slug: result.workspaceSlug,
                    secret_count: result.count,
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
