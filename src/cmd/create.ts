import { config } from "@/lib/config";
import { logError } from "@/lib/error";
import { getSecureInput } from "@/lib/input";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { showMessage } from "@/ui/SuccessMessage";
import { type CreateSecretInput, createSecretSchema } from "@/validators/secret";
import type { Command } from "commander";
import { z } from "zod";

export async function createSecretCommand(name: string, value: string): Promise<void> {
    let input: CreateSecretInput;

    try {
        input = createSecretSchema.parse({ name, value });
    } catch (err: unknown) {
        if (err instanceof z.ZodError) {
            throw new Error(err.issues.map((i) => i.message).join("\n"));
        }
        throw err;
    }

    const { name: validName, value: validValue } = input;

    const projectConfig = await config.findProjectConfig(process.cwd());

    const provider = providerRegistry.get(projectConfig.provider);
    if (!provider) {
        const availableProviders = providerRegistry
            .list()
            .map((p) => p.name)
            .join(", ");
        throw new Error(`Provider "${projectConfig.provider}" not found. Available providers: ${availableProviders}`);
    }

    await provider.createSecret(projectConfig, validName, validValue);

    showMessage(`Secret created successfully! Name: ${validName}`);
}

export function registerCreateCommand(program: Command) {
    program
        .command("create")
        .description("Create a new secret in the current environment")
        .argument("<name>", "Secret name (key) - can only contain A-Z, a-z, 0-9, underscore (_), hyphen (-)")
        .argument(
            "[value]",
            'Secret value. Use quotes for values with spaces or special characters. Example: ek create <name> "my value!@#$%^&*()"',
        )
        .action(async (name: string, value?: string) => {
            try {
                let secretValue = value ?? "";

                if (!secretValue.trim()) {
                    secretValue = await getSecureInput("Enter secret value: ");
                }

                await createSecretCommand(name, secretValue);
            } catch (error: unknown) {
                logError(error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });
}
