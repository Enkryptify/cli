import { logError } from "@/lib/error";
import { getSecureInput } from "@/lib/input";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { LoginFlow } from "@/ui/LoginFlow";
import type { Command } from "commander";

export function registerLoginCommand(program: Command) {
    program
        .command("login")
        .description("The login command is used to authenticate with a provider.")
        .option("-p, --provider <providerName>", "Provider name (defaults to 'enkryptify' if available)")
        .option("-f, --force", "Force re-authentication even if already logged in")
        .option("-k, --key <token>", "Token/key for providers that require it (e.g. 1Password)")
        .action(async (options: { provider?: string; force?: boolean; key?: string }) => {
            const fallbackProviderName = "enkryptify";
            const providerName = options.provider || fallbackProviderName;

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
                        `Provider "${providerName}" not found. Available providers: ${availableProviders || "none"}`,
                    );
                }

                process.exit(1);
            }

            // For 1Password, prompt for token BEFORE showing UI if not provided via CLI
            let token = options.key;
            if (providerName === "onePassword" && !token) {
                token = await getSecureInput("Enter your 1Password service account token (input hidden): ");
            }

            try {
                await LoginFlow({
                    provider: providerInstance,
                    options: {
                        providerName: providerName,
                        force: options.force,
                        key: token,
                    },
                    onError: (error) => {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        logError(errorMessage);
                        process.exit(1);
                    },
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
