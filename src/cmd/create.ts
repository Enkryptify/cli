import { config } from "@/lib/config";
import { logError } from "@/lib/error";
import { getSecureInput } from "@/lib/input";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { showMessage } from "@/ui/SuccessMessage";
import type { Command } from "commander";

export async function createSecretCommand(name: string, value: string): Promise<void> {
    const namePattern = /^[A-Za-z0-9_-]+$/;
    if (!namePattern.test(name)) {
        throw new Error(
            `Invalid secret name "${name}". Name can only contain A-Z, a-z, 0-9, underscore (_), and hyphen (-).`,
        );
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

    if (!value || value.trim().length === 0) {
        throw new Error("Secret value cannot be empty.");
    }

    await provider.createSecret(projectConfig, name, value);

    showMessage(`Secret created successfully! Name: ${name}`);
}

export function registerCreateCommand(program: Command) {
    program
        .command("create")
        .description("Create a new secret in the current environment")
        .argument("<name>", "Secret name (key) - can only contain A-Z, a-z, 0-9, underscore (_), and hyphen (-)")
        .argument(
            "[value]",
            'Secret value. Use quotes for values with spaces or special characters  Example: ek create <name> "my value!@#$%^&*()"',
        )
        .action(async (name: string, value?: string) => {
            try {
                let secretValue = value;
                if (!secretValue || secretValue.trim().length === 0) {
                    secretValue = await getSecureInput("Enter secret value: ");
                    if (!secretValue || secretValue.trim().length === 0) {
                        throw new Error("Secret value cannot be empty please provide a value.");
                    }
                }
                await createSecretCommand(name, secretValue);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
