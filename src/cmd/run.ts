import { type ProjectConfig, config } from "@/lib/config";
import { logError } from "@/lib/error";
import { buildEnvWithSecrets } from "@/lib/inject";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import { RunFlow } from "@/ui/RunFlow";
import type { Command } from "commander";

export async function runCommand(
    projectconfig: ProjectConfig,
    cmd: string[],
    options?: { env?: string; unmountSpinner?: () => void },
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

    // Unmount spinner right after secrets are fetched, before command runs
    if (options?.unmountSpinner) {
        options.unmountSpinner();
    }

    // ✅ Print immediately after injection (before the user's command output starts)
    const successMessage = options?.env
        ? `Secrets injected successfully for environment "${options.env}".\n`
        : "Secrets injected successfully.\n";
    process.stderr.write(successMessage);

    if (cmd.length === 0) {
        throw new Error("Command is required. Please provide a command to run.");
    }

    const [bin, ...args] = cmd;

    if (!bin) {
        throw new Error("Command is required. Please provide a command to run.");
    }

    const proc = Bun.spawn([bin, ...args], {
        env: env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new Error(`Command exited with code ${exitCode}`);
    }
}

export function registerRunCommand(program: Command) {
    program
        .command("run")
        .description("Run a command with secrets from the provider injected as environment variables.")
        .option("-e, --env <environmentName>", "Environment name to use (overrides default from config)")
        .argument(
            "<cmd...>",
            "Command and arguments to run (e.g. 'pnpm run dev' or use '--' to separate: 'ek run -- pnpm run dev')",
        )
        .action(async (cmd: string[], opts: { env?: string }) => {
            try {
                const projectConfig: ProjectConfig = await config.findProjectConfig(process.cwd());

                await RunFlow({
                    envName: opts.env,
                    run: async (unmountSpinner) => {
                        await runCommand(projectConfig, cmd, {
                            ...opts,
                            unmountSpinner,
                        });
                    },
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
