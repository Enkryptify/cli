import { type ConfigureScope, config } from "@/lib/config";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { getGitRepoInfo } from "@/lib/git";
import { logger } from "@/lib/logger";
import { client } from "@/api/client";
import { selectName } from "@/ui/SelectItem";
import type { Command } from "commander";

type ConfigureCommandOptions = {
    git?: boolean;
};

const GIT_SCOPE_LABEL = "Git repository (recommended)";
const PATH_SCOPE_LABEL = "This path only";

async function resolveConfigureScope(projectPath: string, options: ConfigureCommandOptions): Promise<ConfigureScope> {
    const gitRepo = await getGitRepoInfo(projectPath);

    if (options.git) {
        if (!gitRepo) {
            throw new CLIError(
                "No Git repository found.",
                "The current directory is not inside a Git repository.",
                'Run "ek configure" without --git to set up this path, or run it from inside a Git repository.',
                "/cli/troubleshooting#configuration",
            );
        }
        return "git";
    }

    if (!gitRepo) {
        return "path";
    }

    const selectedScope = await selectName(
        [GIT_SCOPE_LABEL, PATH_SCOPE_LABEL],
        "Connect this setup to this path or to the Git repository?",
    );

    return selectedScope === PATH_SCOPE_LABEL ? "path" : "git";
}

export async function configure(options: ConfigureCommandOptions = {}): Promise<Record<string, string>> {
    const authenticated = await config.isAuthenticated();
    if (!authenticated) {
        throw CLIError.from("AUTH_NOT_LOGGED_IN");
    }

    const projectPath = process.cwd();
    const scope = await resolveConfigureScope(projectPath, options);

    const projectConfig = await client.configure(projectPath, { scope });

    await config.createConfigure(projectPath, projectConfig, { scope });

    return projectConfig;
}

export function registerConfigureCommand(program: Command) {
    program
        .command("configure")
        .alias("setup")
        .description("The configure command is used to set up a project with Enkryptify.")
        .option("--git", "Connect this setup to the current Git repository instead of only this path")
        .action(async (options: ConfigureCommandOptions) => {
            const tracker = analytics.trackCommand("command_configure");

            try {
                const projectConfig = await configure(options);
                tracker.success({
                    workspace_slug: projectConfig.workspace_slug,
                });
            } catch (error) {
                tracker.error(error);
                if (error instanceof CLIError) {
                    logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                } else {
                    logger.error(error instanceof Error ? error.message : String(error));
                }
                process.exit(1);
            }
        });
}
