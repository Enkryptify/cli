import { providerRegistry } from "@/providers/registry/ProviderRegistry";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface ProjectConfig {
    path: string;
    provider: string;
    [key: string]: any;
}

interface ConfigFile {
    setups: {
        [projectPath: string]: {
            provider: string;
            [key: string]: string;
        };
    };
    providers: {
        [providerName: string]: Record<string, string>;
    };
    lastUpdateCheck?: string;
    latestVersion?: string;
}

const CONFIG_FILE = path.join(os.homedir(), ".enkryptify", "config.json");

function exitWithError(message: string): never {
    console.error("\n FATAL ERROR:\n");
    console.error(message);
    console.error("\nThe application cannot continue.\n");
    process.exit(1);
}

async function createDefaultConfig(): Promise<ConfigFile> {
    const defaultConfig: ConfigFile = { setups: {}, providers: {} };

    try {
        await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
        await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), "utf-8");
        console.log(`✓ Created new configuration file at "${CONFIG_FILE}"`);
        return defaultConfig;
    } catch (err: any) {
        exitWithError(
            `Cannot create configuration file at:\n"${CONFIG_FILE}"\n\n` +
                `Reason: ${err.message}\n` +
                `Please check your permissions.`,
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
            const parsed = JSON.parse(data);

            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                exitWithError(
                    `Configuration file must contain a JSON object:\n"${CONFIG_FILE}"\n\n` +
                        `Current content is: ${Array.isArray(parsed) ? "array" : typeof parsed}\n` +
                        `Please fix the file or delete it to start fresh.`,
                );
            }

            if (!parsed.setups || !parsed.providers) {
                if (!parsed.setups) parsed.setups = {};
                if (!parsed.providers) parsed.providers = {};
            }
            if (Array.isArray(parsed.setups)) {
                const setupsObj: { [key: string]: { provider: string; [key: string]: string } } = {};

                for (const setup of parsed.setups) {
                    if (!setup.path) continue;
                    const normalizedPath = path.resolve(setup.path);
                    const { path: _, ...setupData } = setup;
                    setupsObj[normalizedPath] = {
                        provider: setup.provider ?? "enkryptify",
                        ...setupData,
                    };
                }

                if (!parsed.latestVersion) {
                    parsed.latestVersion = null;
                }
                if (!parsed.lastUpdateCheck) {
                    parsed.lastUpdateCheck = null;
                }

                parsed.setups = setupsObj;
                await saveConfig(parsed);
            }

            return parsed as ConfigFile;
        } catch (parseErr: any) {
            exitWithError(
                `Configuration file contains invalid JSON:\n"${CONFIG_FILE}"\n\n` +
                    `Error: ${parseErr.message}\n` +
                    `Please fix the file or delete it to start fresh.`,
            );
        }
    } catch (err: any) {
        if (err.code === "ENOENT") {
            return await createDefaultConfig();
        }

        if (err.code === "EACCES") {
            exitWithError(
                `Permission denied reading configuration file:\n"${CONFIG_FILE}"\n\n` +
                    `Please check file permissions.`,
            );
        }

        exitWithError(`Cannot access configuration file:\n"${CONFIG_FILE}"\n\n` + `Reason: ${err.message}`);
    }
}

export async function saveConfig(config: ConfigFile): Promise<void> {
    try {
        await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });

        const tempFile = `${CONFIG_FILE}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(config, null, 2), "utf-8");
        await fs.rename(tempFile, CONFIG_FILE);
    } catch (err: any) {
        if (err.code === "EACCES") {
            exitWithError(
                `Permission denied writing configuration file:\n"${CONFIG_FILE}"\n\n` +
                    `Please check file and directory permissions.`,
            );
        }

        if (err.code === "EROFS") {
            exitWithError(
                `Cannot write to read-only filesystem:\n"${CONFIG_FILE}"\n\n` +
                    `The filesystem is mounted as read-only.`,
            );
        }

        exitWithError(`Cannot save configuration file:\n"${CONFIG_FILE}"\n\n` + `Reason: ${err.message}`);
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
        "No project configuration found. Please run 'ek configure <provider>' to set up your project first.",
    );
}

export const config = {
    updateProvider,
    getProvider,
    createConfigure,
    getConfigure,
    findProjectConfig,
};
