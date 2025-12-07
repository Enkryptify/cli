import type { ProjectConfig } from "@/lib/config.js";
import { config } from "@/lib/config.js";
import { buildEnvWithSecrets } from "@/lib/inject";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import { RunFlow } from "@/ui/RunFlow.js";
import type { Command } from "commander";
import { render } from "ink";
import React from "react";

export async function runCommand(
    projectconfig: ProjectConfig,
    cmd: string[],
    options?: { env?: string },
): Promise<void> {
    const provider = providerRegistry.get(projectconfig.provider);
    if (!provider) {
        const availableProviders = providerRegistry
            .list()
            .map((p) => p.name)
            .join(", ");
        throw new Error(`Provider "${projectconfig.provider}" not found. Available providers: ${availableProviders}`);
    }

    const secrets = await provider.run(projectconfig, { env: options?.env });

    const env = buildEnvWithSecrets(secrets);

    if (!cmd || cmd.length === 0) {
        return;
    }

    const [bin, ...args] = cmd;
    await Bun.$`${bin} ${args.join(" ")}`.env(env);
}

export function registerRunCommand(program: Command) {
    program
        .command("run")
        .description("Inject secrets and optionally run a command")
        .option("-e, --env <environment>", "Override environment for this run")
        .argument("[cmd...]", "Command to run (e.g. pnpm run dev)")
        .action(async (cmd: string[], opts: { env?: string }) => {
            let app: ReturnType<typeof render> | null = null;

            try {
                const projectConfig: ProjectConfig = await config.findProjectConfig(process.cwd());

                const envName =
                    opts.env ??
                    (projectConfig as any).environment ??
                    (projectConfig as any).environment_id ??
                    "default";

                app = render(
                    React.createElement(RunFlow, {
                        projectConfig,
                        envName,
                        run: () => runCommand(projectConfig, cmd, opts),
                    }),
                );

                await app.waitUntilExit();
            } catch (error) {
                if (app) {
                    app.unmount();
                }

                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("\n Error:", errorMessage);
                process.exit(1);
            }
        });
}
