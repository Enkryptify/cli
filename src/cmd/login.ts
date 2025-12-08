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
        .argument("[provider]", "Provider name (defaults to 'enkryptify' if available)")
        .option("-f, --force", "Force re-authentication even if already logged in")
        .action(async (providerArg: string | undefined, options: LoginOptions & { force?: boolean }) => {
            const fallbackProviderName = "enkryptify";
            const providerName = providerArg || fallbackProviderName;

            const providerInstance = providerRegistry.get(providerName);

            if (!providerInstance) {
                const availableProviders = providerRegistry
                    .list()
                    .map((p) => p.name)
                    .join(", ");

                if (!providerArg) {
                    console.error(
                        `\nError: No provider specified and default "${fallbackProviderName}" is not available.\n` +
                            `Available providers: ${availableProviders || "none"}`,
                    );
                } else {
                    console.error(
                        `\nError: Provider "${providerName}" not found. Available providers: ${
                            availableProviders || "none"
                        }`,
                    );
                }

                process.exit(1);
            }

            try {
                const app = render(
                    React.createElement(LoginFlow, {
                        providerName,
                        runLogin: async () => {
                            await runLogin(providerName, providerInstance, options);
                        },
                    }) as React.ReactElement,
                );

                await app.waitUntilExit();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (!errorMessage.includes("Provider") && !errorMessage.includes("No provider")) {
                    console.error("\nError:", errorMessage);
                }
                process.exit(1);
            }
        });
}
