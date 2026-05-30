import { CLIError } from "@/lib/errors";
import { type GitRepoInfo, getGitRepoInfo } from "@/lib/git";
import { logger } from "@/lib/logger";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export type ConfigureScope = "path" | "git";

export type ProjectConfig = {
    path: string;
    [key: string]: string;
};

export const LOCAL_CONFIG_FILENAME = ".enkryptify.json";

type ConfigureOptions = {
    scope?: ConfigureScope;
};

type ConfigFile = {
    setups: {
        [projectPath: string]: Record<string, string>;
    };
    providers: {
        [providerName: string]: Record<string, string>;
    };
    settings?: {
        apiBaseUrl?: string;
        [key: string]: string | undefined;
    };
};

const CONFIG_FILE = process.env.ENKRYPTIFY_CONFIG_PATH ?? path.join(os.homedir(), ".enkryptify", "config.json");

function exitWithError(message: string, options?: { why?: string; fix?: string; docs?: string }): never {
    logger.error(message, options);
    process.exit(1);
}

async function createDefaultConfig(): Promise<ConfigFile> {
    const defaultConfig: ConfigFile = { setups: {}, providers: {} };

    try {
        await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
        await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), "utf-8");
        return defaultConfig;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorCode = err instanceof Error && "code" in err ? err.code : undefined;

        let why = errorMessage;
        let fix: string;

        if (errorCode === "EACCES") {
            why = `Permission denied when creating "${path.dirname(CONFIG_FILE)}".`;
            if (process.platform === "win32") {
                fix = `Adjust folder permissions or run your terminal as Administrator.\n  PowerShell example (may require Admin):\n  icacls "${path.dirname(CONFIG_FILE)}" /grant "$env:USERNAME:(OI)(CI)F"`;
            } else {
                fix = `Check directory permissions: chmod 755 "${path.dirname(CONFIG_FILE)}"`;
            }
        } else if (errorCode === "ENOENT") {
            why = "The parent directory does not exist and could not be created.";
            fix =
                process.platform === "win32"
                    ? `Create the directory manually: mkdir "${path.dirname(CONFIG_FILE)}"`
                    : `Create the directory manually: mkdir -p "${path.dirname(CONFIG_FILE)}"`;
        } else {
            why = errorMessage;
            fix =
                process.platform === "win32"
                    ? `Try creating the directory manually: mkdir "${path.dirname(CONFIG_FILE)}"`
                    : `Try creating the directory manually: mkdir -p "${path.dirname(CONFIG_FILE)}"`;
        }

        exitWithError("Could not create the configuration file.", { why, fix });
    }
}

export async function loadConfig(): Promise<ConfigFile> {
    try {
        const data = await fs.readFile(CONFIG_FILE, "utf-8");

        if (!data.trim()) {
            const config: ConfigFile = { setups: {}, providers: {} };
            await saveConfig(config);
            return config;
        }

        try {
            const parsed = JSON.parse(data) as unknown;

            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                exitWithError("Configuration file is corrupted.", {
                    why: "The file contains invalid data.",
                    fix: `Delete the file to reset:\n  ${process.platform === "win32" ? `Remove-Item -Force "${CONFIG_FILE}"` : `rm -f "${CONFIG_FILE}"`}`,
                    docs: "/cli/troubleshooting#configuration",
                });
            }

            const config = parsed as Partial<ConfigFile>;

            if (!config.setups) config.setups = {};
            if (!config.providers) config.providers = {};
            if (Array.isArray(config.setups)) {
                const setupsObj: ConfigFile["setups"] = {};

                for (const setup of config.setups as ProjectConfig[]) {
                    if (!setup.path) continue;
                    const normalizedPath = path.resolve(setup.path);
                    const { path: _, ...setupData } = setup as ProjectConfig;
                    setupsObj[normalizedPath] = setupData as Record<string, string>;
                }

                config.setups = setupsObj;
                await saveConfig(config as ConfigFile);
            }

            return config as ConfigFile;
        } catch (parseErr: unknown) {
            if (parseErr instanceof CLIError) throw parseErr;
            exitWithError("Configuration file contains invalid JSON.", {
                why: parseErr instanceof Error ? parseErr.message : String(parseErr),
                fix: `Delete the file to reset:\n  ${process.platform === "win32" ? `Remove-Item -Force "${CONFIG_FILE}"` : `rm -f "${CONFIG_FILE}"`}`,
            });
        }
    } catch (err: unknown) {
        if (err instanceof CLIError) throw err;

        if (err instanceof Error && "code" in err && err.code === "ENOENT") {
            return await createDefaultConfig();
        }

        if (err instanceof Error && "code" in err && err.code === "EACCES") {
            exitWithError("Cannot read the configuration file.", {
                why: "Permission denied.",
                fix:
                    process.platform === "win32"
                        ? "Adjust file permissions or run your terminal as Administrator."
                        : "Check file permissions/ownership: chmod 644 ~/.enkryptify/config.json",
            });
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        exitWithError("Cannot access the configuration file.", {
            why: errorMessage,
            fix: 'Try deleting ~/.enkryptify/config.json and running "ek configure" again.',
        });
    }
}

export async function saveConfig(config: ConfigFile): Promise<void> {
    try {
        await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });

        const tempFile = `${CONFIG_FILE}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(config, null, 2), "utf-8");
        await fs.rename(tempFile, CONFIG_FILE);
    } catch (err: unknown) {
        if (err instanceof Error && "code" in err && err.code === "EACCES") {
            exitWithError("Cannot save the configuration file.", {
                why: "Permission denied.",
                fix:
                    process.platform === "win32"
                        ? "Adjust folder permissions or run your terminal as Administrator."
                        : "Check directory/file permissions: chmod 755 ~/.enkryptify",
            });
        }

        if (err instanceof Error && "code" in err && err.code === "EROFS") {
            exitWithError("Cannot save the configuration file.", {
                why: "The filesystem is mounted as read-only.",
                fix: "Remount the filesystem as read-write or use a different directory.",
            });
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        exitWithError("Cannot save the configuration file.", {
            why: errorMessage,
            fix: 'Try deleting ~/.enkryptify/config.json and running "ek configure" again.',
        });
    }
}

async function markAuthenticated(): Promise<void> {
    const config = await loadConfig();
    config.providers["enkryptify"] = {};
    await saveConfig(config);
}

async function clearAuthentication(): Promise<void> {
    const config = await loadConfig();
    delete config.providers["enkryptify"];
    await saveConfig(config);
}

async function isAuthenticated(): Promise<boolean> {
    const config = await loadConfig();
    return config.providers?.["enkryptify"] != null;
}

// `gitRepo` may be passed in to avoid re-running git when the caller already
// resolved it. `undefined` means "not resolved yet", `null` means "resolved, not a repo".
async function getSetupKey(projectPath: string, scope: ConfigureScope, gitRepo?: GitRepoInfo | null): Promise<string> {
    if (scope === "path") {
        return path.resolve(projectPath);
    }

    const repo = gitRepo === undefined ? await getGitRepoInfo(projectPath) : gitRepo;
    if (!repo) {
        throw new CLIError(
            "No Git repository found.",
            "The current directory is not inside a Git repository.",
            'Run "ek configure" without --git to set up this path, or run it from inside a Git repository.',
            "/cli/troubleshooting#configuration",
        );
    }

    return repo.setupKey;
}

async function readLocalConfigAt(dir: string): Promise<ProjectConfig | null> {
    const filePath = path.join(dir, LOCAL_CONFIG_FILENAME);

    let raw: string;
    try {
        raw = await fs.readFile(filePath, "utf-8");
    } catch (err: unknown) {
        if (err instanceof Error && "code" in err && err.code === "ENOENT") {
            return null;
        }
        throw new CLIError(
            `Could not read the project file "${filePath}".`,
            err instanceof Error ? err.message : String(err),
            "Check the file's permissions and try again.",
            "/cli/troubleshooting#configuration",
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err: unknown) {
        throw new CLIError(
            `The project file "${filePath}" contains invalid JSON.`,
            err instanceof Error ? err.message : String(err),
            "Fix the JSON in your .enkryptify.json file.",
            "/cli/troubleshooting#configuration",
        );
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new CLIError(
            `The project file "${filePath}" is not valid.`,
            "The file must contain a JSON object.",
            "See https://docs.enkryptify.com for the .enkryptify.json format.",
            "/cli/troubleshooting#configuration",
        );
    }

    const obj = parsed as Record<string, unknown>;
    const workspace = obj.workspace;
    const project = obj.project;
    const environment = obj.environment;

    if (
        typeof workspace !== "string" ||
        workspace.length === 0 ||
        typeof project !== "string" ||
        project.length === 0 ||
        typeof environment !== "string" ||
        environment.length === 0
    ) {
        throw new CLIError(
            `The project file "${filePath}" is missing required fields.`,
            'It must define non-empty "workspace", "project" and "environment" fields (each may be a slug or an id).',
            "See https://docs.enkryptify.com for the .enkryptify.json format.",
            "/cli/troubleshooting#configuration",
        );
    }

    return {
        path: dir,
        workspace_slug: workspace,
        project_slug: project,
        environment_id: environment,
    };
}

async function createConfigureWithOptions(
    projectPath: string,
    projectConfig: ProjectConfig,
    options: ConfigureOptions = {},
): Promise<void> {
    const config = await loadConfig();
    const scope = options.scope ?? "path";
    const gitRepo = await getGitRepoInfo(projectPath);
    const setupKey = await getSetupKey(projectPath, scope, gitRepo);

    if (!config.setups) config.setups = {};

    const { path: _, ...setupData } = projectConfig;
    config.setups[setupKey] = setupData;

    // When switching this directory to Git scope, drop the now-redundant
    // path-only setup for the same directory. Otherwise the path entry would
    // shadow the Git setup in findProjectConfig and the switch would silently
    // have no effect. We only do this for the same directory, so unrelated
    // nested path setups elsewhere in the repo are preserved. Both the resolved
    // and the symlink-canonical path are removed so a stale setup saved under a
    // symlinked alias (e.g. /var vs /private/var) is also cleared.
    if (scope === "git") {
        const pathKey = path.resolve(projectPath);
        const realPathKey = await fs.realpath(projectPath).catch(() => pathKey);
        for (const key of new Set([pathKey, realPathKey])) {
            if (key !== setupKey && config.setups[key]) {
                delete config.setups[key];
            }
        }
    }

    await saveConfig(config);
}

async function getConfigure(projectPath: string, options: ConfigureOptions = {}): Promise<ProjectConfig | null> {
    const config = await loadConfig();
    const setupKey = await getSetupKey(projectPath, options.scope ?? "path");
    const setup = config.setups?.[setupKey];
    return setup ? { path: setupKey, ...setup } : null;
}

async function hasAnyProject(): Promise<boolean> {
    const cfg = await loadConfig();
    return Object.keys(cfg.setups ?? {}).length > 0;
}

async function findProjectConfig(startPath: string): Promise<ProjectConfig> {
    const config = await loadConfig();
    const setups = config.setups ?? {};
    const gitRepo = await getGitRepoInfo(startPath);

    // Resolve the repo root through symlinks so the boundary comparison below
    // is reliable (e.g. macOS /var vs /private/var).
    let repoRootReal: string | null = null;
    if (gitRepo) {
        repoRootReal = await fs.realpath(gitRepo.root).catch(() => path.resolve(gitRepo.root));
    }

    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;
    let aboveRepoRoot = false;

    while (true) {
        if (!aboveRepoRoot) {
            const localConfig = await readLocalConfigAt(currentPath);
            if (localConfig) {
                return localConfig;
            }
        }

        const setup = setups[currentPath];
        if (setup) {
            return { path: currentPath, ...setup };
        }

        if (gitRepo && repoRootReal) {
            const currentReal = await fs.realpath(currentPath).catch(() => currentPath);
            if (currentReal === repoRootReal) {
                const gitSetup = setups[gitRepo.setupKey];
                if (gitSetup) {
                    return { path: gitRepo.setupKey, ...gitSetup };
                }
                // Parent directories from here up are outside the repository.
                aboveRepoRoot = true;
            }
        }

        if (currentPath === root) break;
        currentPath = path.dirname(currentPath);
    }

    if (gitRepo) {
        const gitSetup = setups[gitRepo.setupKey];
        if (gitSetup) {
            return { path: gitRepo.setupKey, ...gitSetup };
        }
    }

    throw new CLIError(
        "No project configured for this directory.",
        "No Enkryptify configuration was found in this directory or any parent directory.",
        'Run "ek configure" to set up your project.',
        "/cli/troubleshooting#configuration",
    );
}

export const config = {
    markAuthenticated,
    clearAuthentication,
    isAuthenticated,
    createConfigure: createConfigureWithOptions,
    getConfigure,
    findProjectConfig,
    hasAnyProject,
};
