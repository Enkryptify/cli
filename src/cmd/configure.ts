import { config } from "@/lib/config.js";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import type { Command } from "commander";

export async function configure(providerName: string | undefined): Promise<void> {
    const fallbackProviderName = "enkryptify";
    const finalProviderName = providerName || fallbackProviderName;

    const provider = providerRegistry.get(finalProviderName);
    if (!provider) {
        const availableProviders = providerRegistry
            .list()
            .map((p) => p.name)
            .join(", ");

        if (!providerName) {
            throw new Error(
                `No provider specified and default "${fallbackProviderName}" is not available.\n` +
                    `Available providers: ${availableProviders || "none"}`,
            );
        } else {
            throw new Error(
                `Provider "${finalProviderName}" not found. Available providers: ${availableProviders || "none"}`,
            );
        }
    }
    const providerConfig = await config.getProvider(finalProviderName);
    if (!providerConfig) {
        throw new Error(
            `Provider "${finalProviderName}" is not configured. Please run "ek login ${finalProviderName}" first.`,
        );
    }

    const projectPath = process.cwd();

    const projectConfig = await provider.configure(projectPath);

    await config.createConfigure(projectPath, projectConfig);

    console.log(`\n Setup complete! Configuration saved.\n`);
}

export function registerConfigureCommand(program: Command) {
    program
        .command("configure")
        .argument("[provider]", "Provider name (defaults to 'enkryptify' if available)")
        .action(async (provider: string | undefined) => {
            try {
                await configure(provider);
            } catch (error) {
                console.error("\n Error:", error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });
}
