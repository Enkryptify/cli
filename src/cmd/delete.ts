import { config } from "@/lib/config";
import { logError } from "@/lib/error";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import type { Command } from "commander";

export async function deleteSecretCommand(name: string): Promise<void> {
    if (!name || !name.trim()) {
        throw new Error("Secret name is required. Please provide a secret name");
    }

    const projectConfig = await config.findProjectConfig(process.cwd());

    const provider = providerRegistry.get(projectConfig.provider);
    if (!provider) {
        const availableProviders = providerRegistry
            .list()
            .map((p) => p.name)
            .join(", ");
        throw new Error(`Provider "${projectConfig.provider}" not found. Available providers: ${availableProviders}`);
    }

    await provider.deleteSecret(projectConfig, name);
}

export function registerDeleteCommand(program: Command) {
    program
        .command("delete")
        .description("The delete command is used to delete a secret from the current environment.")
        .argument("<name>", "Secret name (key) to delete. Example: ek delete MySecret")
        .action(async (name: string) => {
            try {
                await deleteSecretCommand(name);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
