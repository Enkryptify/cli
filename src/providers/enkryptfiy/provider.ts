import type { ProjectConfig } from "@/lib/config.js";
import { keyring } from "@/lib/keyring.js";
import type { LoginOptions } from "@/providers/base/AuthProvider.js";
import type { Provider, ProviderConfig, Secret, SetupOptions } from "@/providers/base/Provider.js";
import { EnkryptifyAuth } from "@/providers/enkryptfiy/auth.js";
import http from "@/providers/enkryptfiy/httpClient.js";

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

    readonly name = "enkryptify";

    async login(options?: LoginOptions): Promise<void> {
        await this.auth.login(options);
    }

    private async getToken(): Promise<string> {
        const authData = await keyring.get("enkryptify");
        if (!authData?.accessToken) {
            throw new Error('Not authenticated. Please run "ek login enkryptify" first.');
        }

        return authData.accessToken;
    }

    async setup(options: SetupOptions): Promise<ProjectConfig> {
        const token = await this.getToken();

        const { data: workspaces } = await http.get<Workspace[]>("/v1/workspaces", {
            headers: { "X-API-Key": token },
        });
        if (workspaces.length === 0) {
            throw new Error("No workspaces found. Please create a workspace first.");
        }

        const selectedWorkspace = workspaces[0];
        if (!selectedWorkspace) {
            throw new Error("Failed to select workspace");
        }

        const { data: projects } = await http.get<Project[]>(`/v1/workspaces/${selectedWorkspace.slug}/projects`, {
            headers: { "X-API-Key": token },
        });
        if (projects.length === 0) {
            throw new Error(`No projects found in workspace "${selectedWorkspace.name}".`);
        }

        const selectedProject = projects[0];
        if (!selectedProject) {
            throw new Error("Failed to select project");
        }

        const { data: environments } = await http.get<Environment[]>(
            `/v1/workspaces/${selectedWorkspace.slug}/projects/${selectedProject.slug}/environments`,
            {
                headers: { "X-API-Key": token },
            },
        );
        if (environments.length === 0) {
            throw new Error(`No environments found in project "${selectedProject.name}".`);
        }

        const selectedEnv = environments[0];
        if (!selectedEnv) {
            throw new Error("Failed to select environment");
        }

        return {
            path: options.path,
            provider: "enkryptify",
            workspace_slug: selectedWorkspace.slug,
            project_slug: selectedProject.slug,
            environment_id: selectedEnv.id,
        };
    }

    async run(config: ProviderConfig): Promise<Secret[]> {
        const { workspace_slug, project_slug, environment_id } = config;
        if (!workspace_slug || !project_slug || !environment_id) {
            throw new Error("Invalid config: missing workspace_slug, project_slug, or environment_id");
        }

        const token = await this.getToken();

        const { data: secrets } = await http.get<ApiSecret[]>(
            `/v1/workspaces/${workspace_slug}/projects/${project_slug}/secrets`,
            {
                params: { environment_id },
                headers: { "X-API-Key": token },
            },
        );

        return secrets.map((secret) => ({
            name: secret.name,
            value: secret.value,
            metadata: {
                id: secret.id,
            },
        }));
    }

    async createSecret(config: ProviderConfig, name: string, value: string): Promise<void> {
        const { workspace_slug, project_slug, environment_id } = config;
        if (!workspace_slug || !project_slug || !environment_id) {
            throw new Error("Invalid config: missing workspace_slug, project_slug, or environment_id");
        }

        const token = await this.getToken();

        await http.post(
            `/v1/workspaces/${workspace_slug}/projects/${project_slug}/secrets`,
            {
                name,
                value,
                environment_id,
            },
            {
                headers: { "X-API-Key": token },
            },
        );
    }

    async updateSecret(config: ProviderConfig, name: string, value: string): Promise<void> {
        const { workspace_slug, project_slug, environment_id } = config;
        if (!workspace_slug || !project_slug || !environment_id) {
            throw new Error("Invalid config: missing workspace_slug, project_slug, or environment_id");
        }

        const token = await this.getToken();

        await http.put(
            `/v1/workspaces/${workspace_slug}/projects/${project_slug}/secrets/${name}`,
            {
                value,
                environment_id,
            },
            {
                headers: { "X-API-Key": token },
            },
        );
    }

    async deleteSecret(config: ProviderConfig, name: string): Promise<void> {
        const { workspace_slug, project_slug } = config;
        if (!workspace_slug || !project_slug) {
            throw new Error("Invalid config: missing workspace_slug or project_slug");
        }

        const token = await this.getToken();

        try {
            await http.delete(`/v1/workspaces/${workspace_slug}/projects/${project_slug}/secrets/${name}`, {
                headers: { "X-API-Key": token },
            });
        } catch (error: any) {
            if (error.message?.includes("404") || error.message?.includes("not found")) {
                return;
            }
            throw error;
        }
    }

    async listSecrets(config: ProviderConfig): Promise<Secret[]> {
        return this.run(config);
    }
}
