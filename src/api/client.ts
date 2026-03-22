import { type ProjectConfig, config } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getSecureInput, getTextInput } from "@/lib/input";
import { Auth, type LoginOptions } from "@/api/auth";
import http from "@/api/httpClient";
import { confirm } from "@/ui/Confirm";
import { selectName } from "@/ui/SelectItem";
import { AxiosError } from "axios";

export type Secret = {
    id?: string;
    name: string;
    value: string;
    isPersonal?: boolean;
    environmentId?: string;
};

export type RunOptions = {
    env?: string;
    project?: string;
    [key: string]: string | undefined;
};

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

class EnkryptifyClient {
    private auth: Auth;

    constructor() {
        this.auth = new Auth();
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

        const workspaces = await this.fetchResource<Workspace>("/v1/workspace");

        if (workspaces.length === 0) {
            throw new CLIError(
                "No workspaces found.",
                "Your account doesn't have any workspaces yet.",
                "Create a workspace in the Enkryptify dashboard first.",
                "/getting-started",
            );
        }

        const workspaceMap = new Map<string, Workspace>();
        const workspaceLabels = workspaces.map((ws) => {
            const label = `${ws.name} (${ws.slug})`;
            workspaceMap.set(label, ws);
            return label;
        });

        const selectedWorkspaceLabel = await selectName(workspaceLabels, "Select workspace");

        if (!selectedWorkspaceLabel) {
            throw new CLIError(
                "No workspace was selected.",
                undefined,
                "Please select a workspace from the list to continue.",
            );
        }

        const selectedWorkspace = workspaceMap.get(selectedWorkspaceLabel);
        if (!selectedWorkspace) {
            throw new CLIError(
                "The selected workspace could not be found.",
                undefined,
                'Try running "ek configure" again.',
            );
        }

        const workspaceSlug = selectedWorkspace.slug;

        const projectsResponse = await this.fetchResource<ProjectTeam>(`/v1/workspace/${workspaceSlug}/project`);

        const allProjects: Project[] = [];
        for (const team of projectsResponse) {
            if (team.projects && Array.isArray(team.projects)) {
                allProjects.push(...team.projects);
            }
        }

        if (allProjects.length === 0) {
            throw new CLIError(
                `No projects found in workspace "${selectedWorkspace.name}".`,
                "This workspace doesn't have any projects yet.",
                "Create a project in the Enkryptify dashboard.",
                "/getting-started",
            );
        }

        const projectMap = new Map<string, Project>();
        const projectLabels = allProjects.map((p) => {
            const label = `${p.name} (${p.slug})`;
            projectMap.set(label, p);
            return label;
        });

        const selectedProjectLabel = await selectName(projectLabels, "Select project");

        if (!selectedProjectLabel) {
            throw new CLIError(
                "No project was selected.",
                undefined,
                "Please select a project from the list to continue.",
            );
        }

        const selectedProject = projectMap.get(selectedProjectLabel);
        if (!selectedProject) {
            throw new CLIError(
                "The selected project could not be found.",
                undefined,
                'Try running "ek configure" again.',
            );
        }

        const projectSlug = selectedProject.slug;

        const environments = await this.fetchResource<Environment>(
            `/v1/workspace/${workspaceSlug}/project/${projectSlug}/environment`,
        );

        if (environments.length === 0) {
            throw new CLIError(
                `No environments found in project "${selectedProject.name}".`,
                "This project doesn't have any environments set up yet.",
                "Create an environment in the project settings on the Enkryptify dashboard.",
                "/getting-started",
            );
        }

        const environmentName = await selectName(
            environments.map((e) => e.name),
            "Select environment",
        );

        if (!environmentName) {
            throw new CLIError(
                "No environment was selected.",
                undefined,
                "Please select an environment from the list to continue.",
            );
        }

        const environmentId = environments.find((e) => e.name === environmentName)?.id;
        if (!environmentId) {
            throw new CLIError(
                "The selected environment could not be found.",
                undefined,
                'Try running "ek configure" again.',
            );
        }

        const projectConfig: ProjectConfig = {
            path: options,
            workspace_slug: workspaceSlug,
            project_slug: projectSlug,
            environment_id: environmentId,
        };

        logger.success(
            `Setup completed successfully! Workspace: ${selectedWorkspace.name}, Project: ${selectedProject.name}, Environment: ${environmentName}`,
        );

        return projectConfig;
    }

    async run(config: ProjectConfig, options?: RunOptions): Promise<Secret[]> {
        const { workspace_slug, project_slug, environment_id } = this.checkProjectConfig(config);

        const targetProjectSlug = options?.project ?? project_slug;

        const environments = await this.fetchResource<Environment>(
            `/v1/workspace/${workspace_slug}/project/${targetProjectSlug}/environment`,
        );
        if (environments.length === 0) {
            throw new CLIError(
                `No environments found in project "${targetProjectSlug}".`,
                "This project doesn't have any environments set up yet.",
                "Create an environment in the project settings on the Enkryptify dashboard.",
                "/getting-started",
            );
        }

        const targetEnvKey = options?.env ?? environment_id;

        const targetEnvironment = environments.find((e) => e.name === targetEnvKey || e.id === targetEnvKey);

        if (!targetEnvironment) {
            const availableNames = environments.map((e) => e.name).join(", ");
            throw new CLIError(
                `Environment "${targetEnvKey}" not found.`,
                "The environment you specified doesn't exist in this project.",
                `Available environments: ${availableNames}.`,
            );
        }

        const targetEnvironmentId = targetEnvironment.id;

        const response = await http.get<ApiSecret[]>(
            `/v1/workspace/${workspace_slug}/project/${targetProjectSlug}/secret?resolve=true`,
            {
                params: { environment_id: targetEnvironmentId },
            },
        );

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

        const response = await http.get<ApiSecret[]>(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret`);

        if (response.data.length === 0) {
            throw new CLIError(
                "No secrets found.",
                "This project doesn't have any secrets in the current environment.",
                'Use "ek create" to add a secret.',
            );
        }

        if (!name || !name.trim()) {
            throw CLIError.from("VALIDATION_SECRET_NAME_REQUIRED");
        }

        const existingSecret = response.data.find((s) => s.name === name);
        if (!existingSecret) {
            throw new CLIError(
                `Secret "${name}" not found.`,
                "No secret with that name exists in the current environment.",
                'Use "ek list" to see available secrets.',
            );
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
            throw new CLIError(
                `Invalid secret name "${newName}".`,
                "Secret names can only contain letters (A-Z, a-z), numbers (0-9), underscores (_), and hyphens (-).",
            );
        }

        if (response.data.some((s) => s.name === newName && s.id !== existingSecret.id)) {
            throw new CLIError(
                `A secret named "${newName}" already exists.`,
                undefined,
                `Use "ek update ${newName}" to modify it, or choose a different name.`,
            );
        }

        const newValue = await getSecureInput("Enter new value: ");
        if (!newValue || !newValue.trim()) {
            throw new CLIError(
                "Secret value cannot be empty.",
                undefined,
                "Provide a non-empty value for the secret.",
            );
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

        logger.success("Secret updated successfully!");
    }

    async deleteSecret(config: ProjectConfig, name: string): Promise<void> {
        const { workspace_slug, project_slug } = this.checkProjectConfig(config);

        if (!name || !name.trim()) {
            throw CLIError.from("VALIDATION_SECRET_NAME_REQUIRED");
        }

        const response = await this.fetchResource<ApiSecret>(
            `/v1/workspace/${workspace_slug}/project/${project_slug}/secret`,
        );
        if (response.length === 0) {
            throw new CLIError(
                "No secrets found.",
                "This project doesn't have any secrets in the current environment.",
                'Use "ek create" to add a secret.',
            );
        }

        const secret = response.find((s) => s.name === name);
        if (!secret) {
            throw new CLIError(
                `Secret "${name}" not found.`,
                "No secret with that name exists in the current environment.",
                'Use "ek list" to see available secrets.',
            );
        }

        try {
            await http.delete(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret/${secret.id}`);
            logger.success(`Secret "${name}" deleted successfully!`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new CLIError(
                "Could not delete the secret.",
                errorMessage,
            );
        }
    }

    private async fetchResource<T extends Resource>(url: string): Promise<T[]> {
        try {
            const response = await http.get<T[]>(url);
            if (!response.data || response.data.length === 0) {
                const resourceName = url.split("/").filter(Boolean).pop() || "resource";
                throw new CLIError(
                    `Could not find any ${resourceName}.`,
                    undefined,
                    "Create one in the Enkryptify dashboard.",
                );
            }

            return response.data;
        } catch (error) {
            if (error instanceof CLIError) throw error;
            if (error instanceof AxiosError) {
                const status = error.response?.status;
                if (status) {
                    throw new CLIError(
                        "Could not load data from the Enkryptify API.",
                        `The server returned an error (status ${status}).`,
                        'Check your permissions and try again. Run "ek login" if the issue persists.',
                    );
                }
            }
            throw error;
        }
    }

    private checkProjectConfig(config: ProjectConfig) {
        const { workspace_slug, project_slug, environment_id } = config;
        if (!workspace_slug || !project_slug || !environment_id) {
            throw new CLIError(
                "Your project configuration is incomplete.",
                "The configuration file is missing required fields (workspace, project, or environment).",
                'Run "ek configure" to set up your project.',
                "/cli/configure",
            );
        }
        return { workspace_slug, project_slug, environment_id };
    }
}

export const client = new EnkryptifyClient();
