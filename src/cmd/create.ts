import { config } from "@/lib/config.js";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import { showMessage } from "@/ui/SuccessMessage";
import type { Command } from "commander";

export async function createSecretCommand(name: string, value: string): Promise<void> {
    const namePattern = /^[A-Za-z0-9_-]+$/;
    if (!namePattern.test(name)) {
        throw new Error(
            `Invalid secret name "${name}". Name can only contain A-Z, a-z, 0-9, underscore (_), and hyphen (-).`,
        );
    }

    if (!value || value.trim().length === 0) {
        throw new Error("Secret value cannot be empty. Usage: ek create <name> <value>");
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

    await provider.createSecret(projectConfig, name, value);

    showMessage("Secret created successfully!", [
        `Name: ${name}`,
        `Value: ${value.substring(0, 20)}${value.length > 20 ? "..." : ""}`,
    ]);
}

export function registerCreateCommand(program: Command) {
    program
        .command("create")
        .description("Create a new secret in the current environment")
        .argument(
            "<name>",
            "Secret name (key) - can only contain A-Z, a-z, 0-9, underscore (_), and hyphen (-) !!Dont use quotes for the name!!",
        )
        .argument(
            "<value>",
            'Secret value - use quotes for values with spaces or special characters : ek create NAME "my value!@#$%^&*()"',
        )
        .action(async (name: string, value: string) => {
            try {
                await createSecretCommand(name, value);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("\n Error:", errorMessage);
                process.exit(1);
            }
        });
}
