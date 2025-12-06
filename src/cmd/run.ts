import { config } from "@/lib/config.js";
import { buildEnvWithSecrets } from "@/lib/inject";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";
import type { Command } from "commander";

export async function runCommand(cmd?: string[], options?: { env?: string }): Promise<void> {
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

    const secrets = await provider.run(projectConfig, { env: options?.env });

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
            try {
                await runCommand(cmd, opts);
            } catch (error) {
                console.error("\n Error:", error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });
}
