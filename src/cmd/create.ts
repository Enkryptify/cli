import { config } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getSecureInput } from "@/lib/input";
import { client } from "@/api/client";
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

    await client.createSecret(projectConfig, validName, validValue);

    logger.success(`Secret created successfully! Name: ${validName}`);
}

export function registerCreateCommand(program: Command) {
    program
        .command("create")
        .description("Create a new secret in the current environment")
        .argument("<name>", "Secret name (key) - can only contain A-Z, a-z, 0-9, underscore (_), hyphen (-)")
        .argument(
            "[value]",
            'Secret value. Use quotes for values with spaces or special characters. Example: ek secret create <name> "my value!@#$%^&*()"',
        )
        .action(async (name: string, value?: string) => {
            try {
                let secretValue = value ?? "";

                if (!secretValue.trim()) {
                    secretValue = await getSecureInput("Enter secret value: ");
                }

                await createSecretCommand(name, secretValue);
            } catch (error: unknown) {
                if (error instanceof CLIError) {
                    logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                } else {
                    logger.error(error instanceof Error ? error.message : String(error));
                }
                process.exit(1);
            }
        });
}
