import { logError } from "@/lib/error";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { LoginFlow } from "@/ui/LoginFlow";
import type { Command } from "commander";

export function registerLoginCommand(program: Command) {
    program
        .command("login")
        .description("Authenticate with provider")
        .option("-p, --provider <providerName>", "Provider name (defaults to 'enkryptify' if available)")
        .option("-f, --force", "Force re-authentication even if already logged in")
        .action(async (options: { provider?: string; force?: boolean }) => {
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

            try {
                await LoginFlow({
                    provider: providerInstance,
                    options: {
                        providerName: providerName,
                        force: options.force,
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
