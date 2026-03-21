import { config } from "@/lib/config";
import { logError } from "@/lib/error";
import { client } from "@/api/client";
import type { Command } from "commander";

export async function configure(): Promise<void> {
    const providerConfig = await config.getProvider("enkryptify");
    if (!providerConfig) {
        throw new Error(
            'Enkryptify is not configured. Please run "ek login" first.',
        );
    }

    const projectPath = process.cwd();

    const projectConfig = await client.configure(projectPath);

    await config.createConfigure(projectPath, projectConfig);
}

export function registerConfigureCommand(program: Command) {
    program
        .command("configure")
        .alias("setup")
        .description("The configure command is used to set up a project with Enkryptify.")
        .action(async () => {
            try {
                await configure();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
