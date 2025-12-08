import { config, type ProjectConfig } from "@/lib/config.js";
import { getSecureInput, getTextInput } from "@/lib/input.js";
import type { LoginOptions } from "@/providers/base/AuthProvider.js";
import type { Provider, runOptions, Secret } from "@/providers/base/Provider.js";
import { EnkryptifyAuth } from "@/providers/enkryptfiy/auth.js";
import http from "@/providers/enkryptfiy/httpClient.js";
import { confirm } from "@/ui/Confirm";
import { selectName } from "@/ui/SelectItem";
import { showMessage } from "@/ui/SuccessMessage";
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
    readonly name = "enkryptify";

    constructor() {
        this.auth = new EnkryptifyAuth();
    }

    async listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]> {
        const { workspace_slug, project_slug, environment_id } = this.checkProjectConfig(config);

        const response = await http.get<ApiSecret[]>(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret`, {
            params: { environment_id: config.environment_id },
        });

        const shouldShow = showValues === "show";
        const currentEnvId = config.environment_id;

        const secretsValues: Secret[] = response.data.map((secret) => {
            const matching = secret.values.find((v) => v.environmentId === currentEnvId);

            return {
                id: secret.id,
                name: secret.name,
                value: shouldShow && matching ? (matching.value ?? "") : "*********",
                isPersonal: matching?.isPersonal ?? false,
                environmentId: shouldShow && matching ? (matching.environmentId ?? "") : "*********",
            };
        });

        return secretsValues;
    }

    async login(options?: LoginOptions): Promise<void> {
        await this.auth.login(options);
    }

    async configure(options: string): Promise<ProjectConfig> {
        const setup = await config.getConfigure(options);
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

        const environmentName = await selectName(
            environments.map((e) => e.name),
            "Select environment",
        );

        if (!environmentName) throw new Error("Failed to select environment");

        const environmentId = environments.find((e) => e.name === environmentName)?.id;
        if (!environmentId) throw new Error("Failed to find environment ID");

        const projectConfig: ProjectConfig = {
            path: options,
            provider: provider,
            workspace_slug: workspaceSlug,
            project_slug: projectSlug,
            environment_id: environmentId,
        };

        showMessage("Setup completed successfully!", [
            `Workspace: ${workspaceSlug}`,
            `Project: ${projectSlug}`,
            `Environment: ${environmentName}`,
        ]);

        return projectConfig;
    }

    async run(config: ProjectConfig, options?: runOptions): Promise<Secret[]> {
        const { workspace_slug, project_slug, environment_id } = this.checkProjectConfig(config);

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

        return secretsValues;
    }

    async createSecret(config: ProjectConfig, name: string, value: string): Promise<void> {
        const { workspace_slug, project_slug, environment_id } = this.checkProjectConfig(config);

        await http.post(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret`, {
            environments: [environment_id],
            secrets: [
                {
                    key: name,
                    value: value,
                    type: "runtime",
                    dataType: "text",
                },
            ],
        });
    }

    async updateSecret(config: ProjectConfig, name: string): Promise<void> {
        const { workspace_slug, project_slug, environment_id } = this.checkProjectConfig(config);

        const response = await http.get<ApiSecret[]>(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret`, {
            params: { environment_id: environment_id },
        });

        if (response.data.length === 0) {
            throw new Error("No secrets found. Please create a secret first.");
        }

        if (!name || !name.trim()) {
            throw new Error(
                "Secret name is required pls run ek update <secret name> " +
                    " to update a secret. " +
                    ` available secrets: ${response.data.map((s) => s.name).join(", ")}`,
            );
        }

        const existingSecret = response.data.find((s) => s.name === name);
        if (!existingSecret) {
            throw new Error(
                `Secret "${name}" not found.  " available secrets: ${response.data.map((s) => s.name).join(", ")}"`,
            );
        }

        const isPersonal = existingSecret.values.find((v) => v.environmentId === environment_id)?.isPersonal ?? false;

        const newNameInput = await getTextInput(`Enter new name (press Enter to keep "${name}"): `);
        const newName = newNameInput.trim() || name;

        const namePattern = /^[A-Za-z0-9_-]+$/;
        if (!namePattern.test(newName)) {
            throw new Error(
                `Invalid secret name "${newName}". Name can only contain A-Z, a-z, 0-9, underscore (_), and hyphen (-).`,
            );
        }

        if (response.data.some((s) => s.name === newName && s.id !== existingSecret.id)) {
            throw new Error(`Secret with name "${newName}" already exists.`);
        }

        const newValue = await getSecureInput("Enter new value: ");
        if (!newValue || !newValue.trim()) {
            throw new Error("Secret value cannot be empty.");
        }

        await http.put(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret/${existingSecret.id}`, {
            name: newName,
            type: "runtime",
            dataType: "text",
            values: [
                {
                    environmentId: environment_id,
                    value: newValue,
                    isPersonal: isPersonal,
                },
            ],
        });

        showMessage("Secret updated successfully!", [`name: ${newNameInput ? newNameInput : name}`]);
    }

    async deleteSecret(config: ProjectConfig): Promise<void> {
        const { workspace_slug, project_slug } = config;

        const response = await this.fetchResource<ApiSecret>(
            `/v1/workspace/${workspace_slug}/project/${project_slug}/secret`,
        );
        if (response.length === 0) {
            throw new Error("No secrets found. Please create a secret first.");
        }

        const selcetedSecret = await selectName(
            response.map((ws) => `${ws.name}`),
            "select A secert To delete",
        );
        if (!selcetedSecret) throw new Error("Failed to select secret to delete");

        let secretId = response.find((s) => s.name === selcetedSecret)?.id;
        if (!secretId) throw new Error("Failed to find secret ID");
        console.log(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret/${secretId}`);

        try {
            await http.delete(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret/${secretId}`);
            showMessage("Secret deleted successfully!", [`name: ${selcetedSecret}`]);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete secret: ${errorMessage}`);
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

    checkProjectConfig(config: ProjectConfig) {
        const { workspace_slug, project_slug, environment_id } = config;
        if (!workspace_slug || !project_slug || !environment_id) {
            throw new Error(
                "Invalid config: missing workspace_slug, project_slug, or environment_id pls run ek setup first",
            );
        }
        return { workspace_slug, project_slug, environment_id };
    }
}
