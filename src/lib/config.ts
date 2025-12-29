import { logError } from "@/lib/error";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export type ProjectConfig = {
    path: string;
    provider: string;
    [key: string]: string;
};

type ConfigFile = {
    setups: {
        [projectPath: string]: {
            provider: string;
            [key: string]: string;
        };
    };
    providers: {
        [providerName: string]: Record<string, string>;
    };
};

const CONFIG_FILE = path.join(os.homedir(), ".enkryptify", "config.json");

function exitWithError(message: string): never {
    logError(`FATAL ERROR: ${message}\nThe application cannot continue.`);
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

        let additionalInfo = "";
        if (errorCode === "EACCES") {
            if (process.platform === "win32") {
                additionalInfo =
                    `\nThe directory "${path.dirname(CONFIG_FILE)}" exists but you don't have write permissions.\n` +
                    `Fix: adjust folder permissions or run your terminal as Administrator.\n` +
                    `PowerShell example (may require Admin):\n` +
                    `  icacls "${path.dirname(CONFIG_FILE)}" /grant "$env:USERNAME:(OI)(CI)F"`;
            } else {
                additionalInfo =
                    `\nThe directory "${path.dirname(CONFIG_FILE)}" exists but you don't have write permissions.\n` +
                    `Try running: chmod 755 "${path.dirname(CONFIG_FILE)}"`;
            }
        } else if (errorCode === "ENOENT") {
            additionalInfo = `\nThe parent directory does not exist and could not be created.`;
        } else {
            additionalInfo =
                `\nThis might be due to:\n` +
                `- Insufficient permissions on the directory\n` +
                `- Disk space issues\n` +
                `- Filesystem restrictions\n` +
                `\nYou can try creating the directory manually:\n` +
                (process.platform === "win32"
                    ? `  mkdir "${path.dirname(CONFIG_FILE)}"`
                    : `  mkdir -p "${path.dirname(CONFIG_FILE)}"`);
        }

        exitWithError(
            `Failed to create configuration file:\n"${CONFIG_FILE}"\n\n` + `Error: ${errorMessage}${additionalInfo}`,
        );
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
                exitWithError(
                    `Your configuration file is corrupted.\n\n` +
                        `Fix: delete it to reset your configuration:\n` +
                        `  ${CONFIG_FILE}\n\n` +
                        (process.platform === "win32"
                            ? `Windows (PowerShell):\n  Remove-Item -Force "${CONFIG_FILE}"`
                            : `macOS/Linux:\n  rm -f "${CONFIG_FILE}"`),
                );
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
                    setupsObj[normalizedPath] = {
                        provider: setup.provider ?? "enkryptify",
                        ...(setupData as Record<string, string>),
                    };
                }

                config.setups = setupsObj;
                await saveConfig(config as ConfigFile);
            }

            return config as ConfigFile;
        } catch (parseErr: unknown) {
            exitWithError(
                `Configuration file contains invalid JSON:\n"${CONFIG_FILE}"\n\n` +
                    `Error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}\n`,
            );
        }
    } catch (err: unknown) {
        if (err instanceof Error && "code" in err && err.code === "ENOENT") {
            return await createDefaultConfig();
        }

        if (err instanceof Error && "code" in err && err.code === "EACCES") {
            exitWithError(
                `Cannot read configuration file:\n"${CONFIG_FILE}"\n\n` +
                    `Permission denied (EACCES).\n` +
                    (process.platform === "win32"
                        ? `Fix: adjust file permissions or run your terminal as Administrator.`
                        : `Fix: check file permissions/ownership (chmod/chown).`),
            );
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        exitWithError(`Cannot access configuration file ` + `because: ${errorMessage}`);
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
            exitWithError(
                `Cannot write configuration file:\n"${CONFIG_FILE}"\n\n` +
                    `Permission denied (EACCES).\n` +
                    (process.platform === "win32"
                        ? `Fix: adjust folder permissions or run your terminal as Administrator.`
                        : `Fix: check directory/file permissions (chmod/chown).`),
            );
        }

        if (err instanceof Error && "code" in err && err.code === "EROFS") {
            exitWithError(
                `Cannot write to read-only filesystem:\n"${CONFIG_FILE}"\n\n` +
                    `The filesystem is mounted as read-only.`,
            );
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        exitWithError(`Cannot save configuration file` + `because: ${errorMessage}`);
    }
}

async function updateProvider(providerName: string, settings: Record<string, string>): Promise<void> {
    if (!providerRegistry.has(providerName)) {
        const available = providerRegistry.list().map((p) => p.name);
        const availableList = available.length > 0 ? available.join(", ") : "none";

        exitWithError(`Provider "${providerName}" does not exist.\n` + `Available providers: ${availableList}`);
    }

    const config = await loadConfig();

    config.providers[providerName] = {
        ...(config.providers[providerName] || {}),
        ...settings,
    };

    await saveConfig(config);
}

async function getProvider(providerName: string): Promise<Record<string, string> | null> {
    const config = await loadConfig();
    return config.providers?.[providerName] || null;
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

    throw new Error(
        "No project configuration found. Please run 'ek configure or ek setup --provider <provider>' to set up your project first.",
    );
}

export const config = {
    updateProvider,
    getProvider,
    createConfigure,
    getConfigure,
    findProjectConfig,
};
