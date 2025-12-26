import { logError } from "@/lib/error";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { LoginFlow } from "@/ui/LoginFlow";
import type { Command } from "commander";
import { z } from "zod";

const providerOptionSchema = z
    .string()
    .trim()
    .min(1, { message: "Provider name cannot be empty." })
    .transform((v) => v.toLowerCase());

export function registerLoginCommand(program: Command) {
    program
        .command("login")
        .description("The login command is used to authenticate with a provider.")
        .option("-p, --provider <providerName>", "Provider name (defaults to 'enkryptify' if available)")
        .option("-f, --force", "Force re-authentication even if already logged in")
        .action(async (options: { provider?: string; force?: boolean }) => {
            const fallbackProviderName = "enkryptify";

            let providerName = fallbackProviderName;
            if (typeof options.provider === "string") {
                try {
                    providerName = providerOptionSchema.parse(options.provider);
                } catch (err: unknown) {
                    if (err instanceof z.ZodError) {
                        logError(err.issues.map((i) => i.message).join("\n"));
                        process.exit(1);
                    }
                    throw err;
                }
            }

            const providerInstance = providerRegistry.get(providerName);

            if (!providerInstance) {
                const availableProviders = providerRegistry
                    .list()
                    .map((p) => p.name)
                    .join(", ");

                if (!options.provider) {
                    logError(
                        `No provider specified and default "${fallbackProviderName}" is not available.\n` +
                            `Available providers: ${availableProviders || "none"}`,
                    );
                } else {
                    logError(
                        `Provider "${options.provider}" not found. Available providers: ${availableProviders || "none"}`,
                    );
                }

                process.exit(1);
            }

            await LoginFlow({
                provider: providerInstance,
                options: {
                    providerName: providerName,
                    force: options.force,
                },
                onError: (error: Error) => {
                    logError(error instanceof Error ? error.message : String(error));
                    process.exit(1);
                },
            });
        });
}
