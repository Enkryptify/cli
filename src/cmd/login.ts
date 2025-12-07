import { config as authConfig } from "@/lib/config.js";
import type { LoginOptions } from "@/providers/base/AuthProvider.js";
import type { Provider } from "@/providers/base/Provider";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import { LoginFlow } from "@/ui/LoginFlow.js";
import type { Command } from "commander";
import { render } from "ink";
import React from "react";

let finalProviderName: string;

export async function runLogin(
    providerName: string,
    providerInstance: Provider,
    options?: LoginOptions,
): Promise<void> {
    const abortController = new AbortController();

    finalProviderName = providerName;

    await providerInstance.login({ ...options, signal: abortController.signal });

    await authConfig.updateProvider(providerName, {});
}

export function registerLoginCommand(program: Command) {
    program
        .command("login")
        .argument("<provider>", "Provider name...")
        .option("-f, --force", "Force re-authentication even if already logged in")
        .action(async (provider: string, options: LoginOptions & { force?: boolean }) => {
            if (!provider) {
                console.error("\nError: No provider specified. Please specify a provider: ek login <provider>");
                process.exit(1);
            }

            const providerInstance = providerRegistry.get(provider);
            if (!providerInstance) {
                console.error(
                    `\nError: Provider "${provider}" not found. Available providers: ${providerRegistry
                        .list()
                        .map((p) => p.name)
                        .join(", ")}`,
                );
                process.exit(1);
            }

            let app: ReturnType<typeof render> | null = null;

            try {
                app = render(
                    React.createElement(LoginFlow, {
                        providerName: provider,
                        runLogin: async () => {
                            await runLogin(provider, providerInstance, options);
                        },
                    }) as React.ReactElement,
                );

                await app.waitUntilExit();
            } catch (error) {
                if (app) {
                    app.unmount();
                }
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (!errorMessage.includes("Provider") && !errorMessage.includes("No provider")) {
                    console.error("\nError:", errorMessage);
                }
                process.exit(1);
            }
        });
}
