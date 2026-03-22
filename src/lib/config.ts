import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export type ProjectConfig = {
    path: string;
    [key: string]: string;
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

const CONFIG_FILE = path.join(os.homedir(), ".enkryptify", "config.json");

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
            fix = process.platform === "win32"
                ? `Create the directory manually: mkdir "${path.dirname(CONFIG_FILE)}"`
                : `Create the directory manually: mkdir -p "${path.dirname(CONFIG_FILE)}"`;
        } else {
            why = errorMessage;
            fix = process.platform === "win32"
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
                    docs: "/cli/configure",
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
                fix: process.platform === "win32"
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
                fix: process.platform === "win32"
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

async function isAuthenticated(): Promise<boolean> {
    const config = await loadConfig();
    return config.providers?.["enkryptify"] != null;
}

async function createConfigure(projectPath: string, projectConfig: ProjectConfig): Promise<void> {
    const config = await loadConfig();
    const normalizedPath = path.resolve(projectPath);

    if (!config.setups) config.setups = {};

    const { path: _, ...setupData } = projectConfig;
    config.setups[normalizedPath] = setupData;

    await saveConfig(config);
}

async function getConfigure(projectPath: string): Promise<ProjectConfig | null> {
    const config = await loadConfig();
    const normalizedPath = path.resolve(projectPath);
    const setup = config.setups?.[normalizedPath];
    return setup ? { path: normalizedPath, ...setup } : null;
}

async function findProjectConfig(startPath: string): Promise<ProjectConfig> {
    const config = await loadConfig();
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
        const normalizedPath = path.resolve(currentPath);
        const setup = config.setups?.[normalizedPath];
        if (setup) {
            return { path: normalizedPath, ...setup };
        }
        currentPath = path.dirname(currentPath);
    }

    throw new CLIError(
        "No project configured for this directory.",
        "No Enkryptify configuration was found in this directory or any parent directory.",
        'Run "ek configure" to set up your project.',
        "/cli/configure",
    );
}

export const config = {
    markAuthenticated,
    isAuthenticated,
    createConfigure,
    getConfigure,
    findProjectConfig,
};
