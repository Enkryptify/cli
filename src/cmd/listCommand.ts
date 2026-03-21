import { config } from "@/lib/config";
import { logError } from "@/lib/error";
import { client } from "@/api/client";
import { showSecretsTable } from "@/ui/SecretsTable";
import { type Command } from "commander";

export async function listSecretsCommand(mode: "show" | "hide"): Promise<void> {
    const projectConfig = await config.findProjectConfig(process.cwd());

    const secrets = await client.listSecrets(projectConfig, mode);
    showSecretsTable(secrets);
}

export function registerListCommand(program: Command) {
    program
        .command("list")
        .description("The list command is used to show the secrets in the current environment.")
        .option("-s, --show", "Show the table with the secrets values (default: masked)")
        .action(async (opts: { show?: boolean }) => {
            try {
                const mode: "show" | "hide" = opts.show ? "show" : "hide";

                await listSecretsCommand(mode);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
