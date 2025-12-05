import { config } from "@/lib/config.js";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import type { Command } from "commander";

export async function updateSecretCommand(name?: string): Promise<void> {
    const projectConfig = await config.findProjectConfig(process.cwd());

    const provider = providerRegistry.get(projectConfig.provider);
    if (!provider) {
        const availableProviders = providerRegistry
            .list()
            .map((p) => p.name)
            .join(", ");
        throw new Error(`Provider "${projectConfig.provider}" not found. Available providers: ${availableProviders}`);
    }

    await provider.updateSecret(projectConfig, name || "");
}

export function registerUpdateCommand(program: Command) {
    program
        .command("update")
        .description("Update a secret in the current environment")
        .argument("[name]", "Secret name (key) to update. eg: ek update <secret name>")
        .action(async (name?: string) => {
            try {
                await updateSecretCommand(name);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("\n Error:", errorMessage);
                process.exit(1);
            }
        });
}
