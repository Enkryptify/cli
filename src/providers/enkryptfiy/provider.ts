import { config, type ProjectConfig } from "@/lib/config.js";
import type { LoginOptions } from "@/providers/base/AuthProvider.js";
import type { Provider, ProviderConfig, runOptions, Secret } from "@/providers/base/Provider.js";
import { EnkryptifyAuth } from "@/providers/enkryptfiy/auth.js";
import http from "@/providers/enkryptfiy/httpClient.js";
import { confirm } from "@/ui/Confirm";
import { showSecretsTable } from "@/ui/SecretsTable.js";
import { selectName } from "@/ui/SelectItem";
import { showSuccessMessage } from "@/ui/SuccessMessage";
import { AxiosError } from "axios";

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

type Resource = Workspace | Project | Environment | ApiSecret;

type ApiSecretValue = {
    environmentId: string;
    value: string;
    isPersonal: boolean;
};

type ApiSecret = {
    id: string;
    name: string;
    values: ApiSecretValue[];
};

export class EnkryptifyProvider implements Provider {
    private auth: EnkryptifyAuth;

    constructor() {
        this.auth = new EnkryptifyAuth();
    }
    listSecrets(config: ProviderConfig): Promise<Secret[]> {
        throw new Error("Method not implemented.");
    }

    readonly name = "enkryptify";

    async login(options?: LoginOptions): Promise<void> {
        await this.auth.login(options);
    }

    async setup(options: string): Promise<ProjectConfig> {
        const setup = await config.getSetup(options);
        if (setup) {
            const overwrite = await confirm("Setup already exists. Overwrite?");
            if (!overwrite) {
                return setup;
            }
        }

        const provider = this.name;

        const workspaces = await this.fetchResource<Workspace>("/v1/workspace");

        if (workspaces.length === 0) {
            throw new Error("No workspaces found. Please create a workspace first before setting up.");
        }

        const workspaceSlug = await selectName(
            workspaces.map((ws) => `${ws.slug}`),
            "Select workspace",
        );

        if (!workspaceSlug) throw new Error("Failed to select workspace");

        const projectsResponse = await this.fetchResource<any>(`/v1/workspace/${workspaceSlug}/project`);

        const allProjects: Project[] = [];
        for (const team of projectsResponse) {
            if (team.projects && Array.isArray(team.projects)) {
                allProjects.push(...team.projects);
            }
        }

        if (allProjects.length === 0) {
            throw new Error(
                `No projects found in workspace "${workspaceSlug}". Please create a project first before setting up.`,
            );
        }

        const projectSlug = await selectName(
            allProjects.map((p) => p.slug),
            "Select project",
        );

        if (!projectSlug) throw new Error("Failed to select project");

        const selectedProject = allProjects.find((p) => p.slug === projectSlug);
        if (!selectedProject) {
            throw new Error("Failed to find selected project");
        }

        const environments = await this.fetchResource<Environment>(
            `/v1/workspace/${workspaceSlug}/project/${projectSlug}/environment`,
        );

        if (environments.length === 0) {
            throw new Error(
                `No environments found in project "${projectSlug}". Please create an environment first before setting up.`,
            );
        }

        const environmentId = await selectName(
            environments.map((e) => e.name),
            "Select environment",
        );

        if (!environmentId) throw new Error("Failed to select environment");

        const projectConfig: ProjectConfig = {
            path: options,
            provider: provider,
            workspace_slug: workspaceSlug,
            project_slug: projectSlug,
            environment_id: environmentId,
        };

        showSuccessMessage("Setup completed successfully!", [
            `Workspace: ${workspaceSlug}`,
            `Project: ${projectSlug}`,
            `Environment: ${environmentId}`,
        ]);

        return projectConfig;
    }

    async run(config: ProjectConfig, options?: runOptions): Promise<Secret[]> {
        const { workspace_slug, project_slug, environment_id } = config as ProjectConfig & {
            workspace_slug?: string;
            project_slug?: string;
            environment_id?: string;
        };

        if (!workspace_slug || !project_slug || !environment_id) {
            throw new Error(
                "Invalid config: missing workspace_slug, project_slug, or environmentId, pls run ek setup first and ek setup",
            );
        }

        const environments = await this.fetchResource<Environment>(
            `/v1/workspace/${workspace_slug}/project/${project_slug}/environment`,
        );
        if (environments.length === 0) {
            throw new Error(`No environments found in project "${project_slug}". Please create an environment`);
        }

        const targetEnvKey = options?.env ?? environment_id;

        const targetEnvironment = environments.find((e) => e.name === targetEnvKey || e.id === targetEnvKey);

        if (!targetEnvironment) {
            const availableNames = environments.map((e) => e.name).join(", ");
            throw new Error(`Environment "${targetEnvKey}" not found. Available environments: ${availableNames}`);
        }

        const targetEnvironmentId = targetEnvironment.id;

        const response = await http.get<ApiSecret[]>(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret`, {
            params: { environment_id: targetEnvironmentId },
        });

        const apiSecrets = response.data;

        const secretsValues: Secret[] = apiSecrets.map((secret) => {
            const matching = secret.values.find((v) => v.environmentId === targetEnvironmentId);
            return {
                id: secret.id,
                name: secret.name,
                value: matching?.value ?? "",
                isPersonal: matching?.isPersonal ?? false,
                environmentId: matching?.environmentId ?? "",
            };
        });

        showSecretsTable(secretsValues);
        return secretsValues;
    }

    async createSecret(config: ProviderConfig, name: string, value: string): Promise<void> {
        const { workspace_slug, project_slug, environment_id } = config;
        if (!workspace_slug || !project_slug || !environment_id) {
            throw new Error("Invalid config: missing workspace_slug, project_slug, or environment_id");
        }

        await http.post(`/v1/workspaces/${workspace_slug}/projects/${project_slug}/secrets`, {
            name,
            value,
            environment_id,
        });
    }

    async updateSecret(config: ProviderConfig, name: string, value: string): Promise<void> {
        const { workspace_slug, project_slug, environment_id } = config;
        if (!workspace_slug || !project_slug || !environment_id) {
            throw new Error("Invalid config: missing workspace_slug, project_slug, or environment_id");
        }

        await http.put(`/v1/workspaces/${workspace_slug}/projects/${project_slug}/secrets/${name}`, {
            value,
            environment_id,
        });
    }

    async deleteSecret(config: ProviderConfig, name: string): Promise<void> {
        const { workspace_slug, project_slug } = config;
        if (!workspace_slug || !project_slug) {
            throw new Error("Invalid config: missing workspace_slug or project_slug");
        }
    }

    private async fetchResource<T extends Resource>(url: string): Promise<T[]> {
        try {
            const response = await http.get<T[]>(url);
            if (!response.data) {
                const resourceName = url.split("/").filter(Boolean).pop() || "resource";
                throw new Error(`No ${resourceName} found. Please create a ${resourceName} first.`);
            }

            return response.data;
        } catch (error) {
            if (error instanceof AxiosError) {
                const status = error.response?.status;
                if (status) throw new Error(`Failed to fetch resources from ${url}. Status: ${status ?? "unknown"}.`);
            }
            throw error;
        }
    }
}
