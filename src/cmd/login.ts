import { config as authConfig } from "@/lib/config.js";
import type { LoginOptions } from "@/providers/base/AuthProvider.js";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import { LoginFlow } from "@/ui/LoginFlow.js";
import type { Command } from "commander";
import { render } from "ink";
import React from "react";

let finalProviderName: string;

export async function runLogin(providerName?: string, options?: LoginOptions): Promise<void> {
    const abortController = new AbortController();

    process.once("SIGINT", () => {
        console.log("\n  Login cancelled by user");
        abortController.abort();
    });

    if (!providerName) {
        throw new Error("No provider specified. Please specify a provider: ek login <provider>");
    }

    const provider = providerRegistry.get(providerName);
    if (!provider) {
        throw new Error(
            `Provider "${providerName}" not found. Available providers: ${providerRegistry
                .list()
                .map((p) => p.name)
                .join(", ")}`,
        );
    }
    finalProviderName = providerName;

    await provider.login({ ...options, signal: abortController.signal });

    await authConfig.updateProvider(providerName, {});
}

export function registerLoginCommand(program: Command) {
    program
        .command("login")
        .argument("<provider>", "Provider name...")
        .option("-f, --force", "Force re-authentication even if already logged in")
        .action(async (provider: string, options: LoginOptions & { force?: boolean }) => {
            let app: ReturnType<typeof render> | null = null;

            try {
                app = render(
                    React.createElement(LoginFlow, {
                        providerName: provider,
                        runLogin: async () => {
                            await runLogin(provider, options);
                        },
                    }) as React.ReactElement,
                );

                await app.waitUntilExit();
            } catch (error) {
                if (app) {
                    app.unmount();
                }
                console.error("\nError:", error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });
}
