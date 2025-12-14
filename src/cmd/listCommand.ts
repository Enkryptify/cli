import { config } from "@/lib/config";
import { logError } from "@/lib/error";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { showSecretsTable } from "@/ui/SecretsTable";
import { type Command } from "commander";

export async function ListSecretsCommand(mode: "show" | "hide"): Promise<void> {
    const projectConfig = await config.findProjectConfig(process.cwd());

    const provider = providerRegistry.get(projectConfig.provider);
    if (!provider) {
        throw new Error(
            `Provider "${projectConfig.provider}" not found. Available providers: ${providerRegistry
                .list()
                .map((p) => p.name)
                .join(", ")}`,
        );
    }

    const secrets = await provider.listSecrets(projectConfig, mode);
    showSecretsTable(secrets);
}

export function registerListCommand(program: Command) {
    program
        .command("list")
        .description("Show the secrets in the current environment")
        .option("-s, --show", "Show the table with the secrets values ")
        .action(async (opts: { show?: boolean }) => {
            try {
                const mode: "show" | "hide" = opts.show ? "show" : "hide";

                await ListSecretsCommand(mode);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
