import { type ProjectConfig, config } from "@/lib/config";
import { getSecureInput, getTextInput } from "@/lib/input";
import type { LoginOptions } from "@/providers/base/AuthProvider";
import type { Provider, Secret, runOptions } from "@/providers/base/Provider";
import { EnkryptifyAuth } from "@/providers/enkryptify/auth";
import http from "@/providers/enkryptify/httpClient";
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

type ProjectTeam = {
    projects: Project[];
};

type Environment = {
    id: string;
    name: string;
};

type Resource = Workspace | Project | ProjectTeam | Environment | ApiSecret;

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
            params: { environment_id: environment_id },
        });

        const shouldShow = showValues === "show";
        const currentEnvId = config.environment_id;

        const secretsValues: Secret[] = response.data.map((secret) => {
            const personalValue = secret.values.find((v) => v.environmentId === currentEnvId && v.isPersonal === true);
            const nonPersonalValue = secret.values.find(
                (v) => v.environmentId === currentEnvId && v.isPersonal === false,
            );

            const matching = personalValue || nonPersonalValue;

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

        const selectedWorkspace = workspaces.find((ws) => ws.slug === workspaceSlug);
        if (!selectedWorkspace) {
            throw new Error("Failed to find selected workspace");
        }

        const projectsResponse = await this.fetchResource<ProjectTeam>(`/v1/workspace/${workspaceSlug}/project`);

        const allProjects: Project[] = [];
        for (const team of projectsResponse) {
            if (team.projects && Array.isArray(team.projects)) {
                allProjects.push(...team.projects);
            }
        }

        if (allProjects.length === 0) {
            throw new Error(
                `No projects found in workspace "${selectedWorkspace.name}". Please create a project first before setting up.`,
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
                `No environments found in project "${selectedProject.name}". Please create an environment first before setting up.`,
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

        showMessage(
            `Setup completed successfully! Workspace: ${selectedWorkspace.name}, Project: ${selectedProject.name}, Environment: ${environmentName}`,
        );

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
            const personalValue = secret.values.find(
                (v) => v.environmentId === targetEnvironmentId && v.isPersonal === true,
            );
            const nonPersonalValue = secret.values.find(
                (v) => v.environmentId === targetEnvironmentId && v.isPersonal === false,
            );

            const matching = personalValue || nonPersonalValue;

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

    async updateSecret(config: ProjectConfig, name: string, isPersonalFlag?: boolean): Promise<void> {
        const { workspace_slug, project_slug, environment_id } = this.checkProjectConfig(config);

        // Fetch all secrets without environment filter to get full secret data
        const response = await http.get<ApiSecret[]>(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret`);

        if (response.data.length === 0) {
            throw new Error("No secrets found. Please create a secret first.");
        }

        if (!name || !name.trim()) {
            throw new Error("Secret name is required. Please provide a secret name");
        }

        const existingSecret = response.data.find((s) => s.name === name);
        if (!existingSecret) {
            throw new Error(`Secret "${name}" not found.`);
        }

        const existingPersonalValue = existingSecret.values.find(
            (v) => v.environmentId === environment_id && v.isPersonal === true,
        );
        const existingNonPersonalValue = existingSecret.values.find(
            (v) => v.environmentId === environment_id && v.isPersonal === false,
        );

        const isPersonal = isPersonalFlag !== undefined ? isPersonalFlag : false;

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

        const otherEnvironmentValues = existingSecret.values.filter((v) => v.environmentId !== environment_id);

        const currentEnvironmentValues: ApiSecretValue[] = [];

        if (isPersonal) {
            if (existingNonPersonalValue) {
                currentEnvironmentValues.push(existingNonPersonalValue);
            }
            currentEnvironmentValues.push({
                environmentId: environment_id,
                value: newValue,
                isPersonal: true,
            });
        } else {
            if (existingPersonalValue) {
                currentEnvironmentValues.push(existingPersonalValue);
            }
            currentEnvironmentValues.push({
                environmentId: environment_id,
                value: newValue,
                isPersonal: false,
            });
        }

        const updatedValues = [...otherEnvironmentValues, ...currentEnvironmentValues];

        await http.put(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret/${existingSecret.id}`, {
            name: newName,
            type: "runtime",
            dataType: "text",
            values: updatedValues,
        });

        showMessage(`Secret updated successfully!`);
    }

    async deleteSecret(config: ProjectConfig, name: string): Promise<void> {
        const { workspace_slug, project_slug } = this.checkProjectConfig(config);

        if (!name || !name.trim()) {
            throw new Error("Secret name is required. Please provide a secret name");
        }

        const response = await this.fetchResource<ApiSecret>(
            `/v1/workspace/${workspace_slug}/project/${project_slug}/secret`,
        );
        if (response.length === 0) {
            throw new Error("No secrets found");
        }

        const secret = response.find((s) => s.name === name);
        if (!secret) {
            throw new Error(`Secret "${name}" not found.`);
        }

        try {
            await http.delete(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret/${secret.id}`);
            showMessage(`Secret "${name}" deleted successfully!`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete secret: ${errorMessage}`);
        }
    }

    private async fetchResource<T extends Resource>(url: string): Promise<T[]> {
        try {
            const response = await http.get<T[]>(url);
            if (!response.data || response.data.length === 0) {
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
