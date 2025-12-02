import type { Provider, Secret, SetupOptions, ProviderConfig } from '../base/Provider.js';
import type { LoginOptions } from '../base/AuthProvider.js';
import { EnkryptifyAuth } from './auth.js';
import type { ProjectConfig } from '../../lib/config.js';

const API_BASE_URL = 'https://api.enkryptify.com/v1';
class ApiClient {
  constructor(private token: string) {}

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-API-Key': this.token,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new Error(`API error: ${response.status} - ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

type Workspace = {
  id: string;
  name: string;
  slug: string;
};

type Project = {
  id: string;
  name: string;
  slug: string;
};

type Environment = {
  id: string;
  name: string;
};

type ApiSecret = {
  id: string;
  name: string;
  value: string;
};

export class EnkryptifyProvider implements Provider {
  private auth: EnkryptifyAuth;

  constructor() {
    this.auth = new EnkryptifyAuth();
  }

  readonly name = 'enkryptify';

  async login(options?: LoginOptions): Promise<void> {
    await this.auth.login(options);
  }

  private async getClient(): Promise<ApiClient> {
    const envToken = process.env.ENKRYPTIFY_TOKEN;
    if (envToken) {
      return new ApiClient(envToken);
    }
    
    const { keyring } = await import('../../lib/keyring.js');
    const authData = await keyring.get('enkryptify');
    if (!authData?.accessToken) {
      throw new Error('Not authenticated. Please run "ek login enkryptify" first.');
    }
    
    return new ApiClient(authData.accessToken);
  }

  async setup(options: SetupOptions): Promise<ProjectConfig> {
    

    const client = await this.getClient();

    const workspaces = await client.get<Workspace[]>('/workspaces');
    if (workspaces.length === 0) {
      throw new Error('No workspaces found. Please create a workspace first.');
    }

    const selectedWorkspace = workspaces[0];
    if (!selectedWorkspace) {
      throw new Error('Failed to select workspace');
    }

    const projects = await client.get<Project[]>(
      `/workspaces/${selectedWorkspace.slug}/projects`
    );
    if (projects.length === 0) {
      throw new Error(`No projects found in workspace "${selectedWorkspace.name}".`);
    }

    const selectedProject = projects[0];
    if (!selectedProject) {
      throw new Error('Failed to select project');
    }

    const environments = await client.get<Environment[]>(
      `/workspaces/${selectedWorkspace.slug}/projects/${selectedProject.slug}/environments`
    );
    if (environments.length === 0) {
      throw new Error(
        `No environments found in project "${selectedProject.name}".`
      );
    }

    const selectedEnv = environments[0];
    if (!selectedEnv) {
      throw new Error('Failed to select environment');
    }

    return {
      path: options.path,
      provider: 'enkryptify',
      workspace_slug: selectedWorkspace.slug,
      project_slug: selectedProject.slug,
      environment_id: selectedEnv.id,
    };
  }

  async run(config: ProviderConfig): Promise<Secret[]> {

    const { workspace_slug, project_slug, environment_id } = config;
    if (!workspace_slug || !project_slug || !environment_id) {
      throw new Error(
        'Invalid config: missing workspace_slug, project_slug, or environment_id'
      );
    }

    const client = await this.getClient();

    const secrets = await client.get<ApiSecret[]>(
      `/workspaces/${workspace_slug}/projects/${project_slug}/secrets?environment_id=${environment_id}`
    );

    return secrets.map(secret => ({
      name: secret.name,
      value: secret.value,
      metadata: {
        id: secret.id,
      },
    }));
  }

  async createSecret(
    config: ProviderConfig,
    name: string,
    value: string
  ): Promise<void> {


    const { workspace_slug, project_slug, environment_id } = config;
    if (!workspace_slug || !project_slug || !environment_id) {
      throw new Error(
        'Invalid config: missing workspace_slug, project_slug, or environment_id'
      );
    }

    const client = await this.getClient();

    await client.post(
      `/workspaces/${workspace_slug}/projects/${project_slug}/secrets`,
      {
        name,
        value,
        environment_id,
      }
    );
  }

  async updateSecret(
    config: ProviderConfig,
    name: string,
    value: string
  ): Promise<void> {


    const { workspace_slug, project_slug, environment_id } = config;
    if (!workspace_slug || !project_slug || !environment_id) {
      throw new Error(
        'Invalid config: missing workspace_slug, project_slug, or environment_id'
      );
    }

    const client = await this.getClient();

    await client.put(
      `/workspaces/${workspace_slug}/projects/${project_slug}/secrets/${name}`,
      {
        value,
        environment_id,
      }
    );
  }

  async deleteSecret(config: ProviderConfig, name: string): Promise<void> {


    const { workspace_slug, project_slug } = config;
    if (!workspace_slug || !project_slug) {
      throw new Error('Invalid config: missing workspace_slug or project_slug');
    }

    const client = await this.getClient();

    try {
      await client.delete(
        `/workspaces/${workspace_slug}/projects/${project_slug}/secrets/${name}`
      );
    } catch (error: any) {

      if (error.message?.includes('404') || error.message?.includes('not found')) {
        return;
      }
      throw error;
    }
  }

  async listSecrets(config: ProviderConfig): Promise<Secret[]> {
    return this.run(config);
  }
}

