import { config } from "@/lib/config";
import { logError } from "@/lib/error";
import { client } from "@/api/client";
import type { Command } from "commander";

export async function updateSecretCommand(name: string, isPersonal?: boolean): Promise<void> {
    if (!name || !name.trim()) {
        throw new Error("Secret name is required. Please provide a secret name.");
    }

    const projectConfig = await config.findProjectConfig(process.cwd());

    await client.updateSecret(projectConfig, name, isPersonal);
}

export function registerUpdateCommand(program: Command) {
    program
        .command("update")
        .description("Update a secret in the current environment")
        .argument("<name>", "Secret name (key) to update. Example: ek update MySecret")
        .option("--ispersonal", "Make the secret personal")
        .action(async (name: string, opts?: { ispersonal?: boolean }) => {
            try {
                await updateSecretCommand(name, opts?.ispersonal);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
