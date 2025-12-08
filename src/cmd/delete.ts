import { config } from "@/lib/config.js";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import type { Command } from "commander";

export async function deleteSecretCommand(): Promise<void> {
    const projectConfig = await config.findProjectConfig(process.cwd());

    const provider = providerRegistry.get(projectConfig.provider);
    if (!provider) {
        const availableProviders = providerRegistry
            .list()
            .map((p) => p.name)
            .join(", ");
        throw new Error(`Provider "${projectConfig.provider}" not found. Available providers: ${availableProviders}
            Please run 'ek login <provider>' to login to the provider first.`);
    }

    await provider.deleteSecret(projectConfig);
}

export function registerDeleteCommand(program: Command) {
    program
        .command("delete")
        .description("Delete a secret from the current environment")
        .action(async () => {
            try {
                await deleteSecretCommand();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("\n Error:", errorMessage);
                process.exit(1);
            }
        });
}
