import * as fs from 'fs/promises';
import * as path from 'path';

interface ConfigFile {
  setups: {
    [projectPath: string]: {
      provider: string;
      [key: string]: string;
    };
  };
  providers: {
    [providerName: string]: {
      settings: Record<string, string | number | boolean>; 
    };
  };
}

export interface ProjectConfig {
  path: string;
  provider: string;
  [key: string]: any; 
}

class ConfigManager {
  private configPath: string;
  private configDir: string;

  constructor() {
    const projectRoot = process.cwd();
    this.configDir = path.join(projectRoot, '.enkryptify');
    this.configPath = path.join(this.configDir, 'config.json');
  }

  private async ensureConfigExists(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    
    try {
      await fs.access(this.configPath);
    } catch {
      await fs.writeFile(
        this.configPath,
        JSON.stringify({ setups: {}, providers: {} }, null, 2),
        'utf-8'
      );
    }
  }

  private async loadConfig(): Promise<ConfigFile> {
    await this.ensureConfigExists();
    
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content) as ConfigFile;
    } catch (error) {
      return { setups: {}, providers: {} };
    }
  }

  private async saveConfig(config: ConfigFile): Promise<void> {
    await this.ensureConfigExists();
    await fs.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  async createProvider(
    providerName: string,
    settings: { [key: string]: any }
  ): Promise<void> {
    const config = await this.loadConfig();
    
    if (!config.providers) {
      config.providers = {};
    }

    config.providers[providerName] = {
      settings,
    };

    await this.saveConfig(config);
  }

  async getProvider(providerName: string): Promise<{ settings: { [key: string]: any } } | null> {
    const config = await this.loadConfig();
    return config.providers?.[providerName] || null;
  }

  async hasProvider(providerName: string): Promise<boolean> {
    const config = await this.loadConfig();
    return !!config.providers?.[providerName];
  }

  async overrideProvider(
    providerName: string,
    settings: { [key: string]: any }
  ): Promise<void> {
    await this.createProvider(providerName, settings);
  }

 
  async createSetup(projectPath: string, config: ProjectConfig): Promise<void> {
    const fileConfig = await this.loadConfig();
    const normalizedPath = path.resolve(projectPath);
    
    if (!fileConfig.setups) {
      fileConfig.setups = {};
    }

    const { path: _, ...setupData } = config;
    
    fileConfig.setups[normalizedPath] = {
      ...setupData, 
    };

    await this.saveConfig(fileConfig);
  }

  async getSetup(projectPath: string): Promise<ProjectConfig | null> {
    const config = await this.loadConfig();
    const normalizedPath = path.resolve(projectPath);
    const setup = config.setups?.[normalizedPath];
    
    if (!setup) {
      return null;
    }

    return {
      path: normalizedPath,
      ...setup,
    };
  }

  async findProjectConfig(startPath: string): Promise<ProjectConfig | null> {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      const config = await this.getSetup(currentPath);
      if (config) {
        return config;
      }
      currentPath = path.dirname(currentPath);
    }

    const rootConfig = await this.getSetup(root);
    return rootConfig;
  }

  async overrideSetup(projectPath: string, config: ProjectConfig): Promise<void> {
    await this.createSetup(projectPath, config);
  }

  async getDefaultProvider(): Promise<string | undefined> {
    const config = await this.loadConfig();
    for (const [name, provider] of Object.entries(config.providers || {})) {
      if (provider.settings?.default === true || provider.settings?.authenticated === true) {
        return name;
      }
    }
    return undefined;
  }

  async setDefaultProvider(providerName: string): Promise<void> {
    const config = await this.loadConfig();
    for (const name of Object.keys(config.providers || {})) {
      if (config.providers[name]?.settings?.default === true) {
        delete config.providers[name].settings.default;
      }
    }
    const provider = config.providers?.[providerName];
    if (provider) {
      provider.settings = { ...provider.settings, default: true };
    } else {
      if (!config.providers) config.providers = {};
      config.providers[providerName] = {
        settings: { default: true },
      };
    }
    await this.saveConfig(config);
  }

  async markAuthenticated(providerName: string, metadata?: { [key: string]: any }): Promise<void> {
    const provider = await this.getProvider(providerName);
    const nowSec = Math.floor(Date.now() / 1000);
    
    if (provider) {
      await this.overrideProvider(providerName, {
        ...provider.settings,
        authenticated: true,
        last_login: nowSec,
        ...metadata,
      });
    } else {
      await this.createProvider(providerName, {
        authenticated: true,
        last_login: nowSec,
        ...metadata,
      });
    }
  }

}

export const config = new ConfigManager();
