import { config } from "@/lib/config.js";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import type { Command } from "commander";

export async function runSetup(providerName: string): Promise<void> {
    if (!providerName) {
        throw new Error("No provider specified. Please specify a provider: ek setup <provider>");
    }

    const provider = providerRegistry.get(providerName);
    if (!provider) {
        throw new Error(
            `Provider "${providerName}" not found. Available providers: ${providerRegistry
                .list()
                .map((p) => p.name)
                .join(", ")}`,
        );
    }
    const providerConfig = await config.getProvider(providerName);
    if (!providerConfig) {
        throw new Error(`Provider "${providerName}" is not configured. Please run "ek login ${providerName}" first.`);
    }

    const projectPath = process.cwd();

    const projectConfig = await provider.setup(projectPath);

    await config.createSetup(projectPath, projectConfig);

    console.log(`\n Setup complete! Configuration saved.\n`);
}

export function registerSetupCommand(program: Command) {
    program
        .command("setup")
        .argument("<provider>", "Provider name (e.g., enkryptify)")
        .action(async (provider: string) => {
            try {
                await runSetup(provider);
            } catch (error) {
                console.error("\n Error:", error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });
}
