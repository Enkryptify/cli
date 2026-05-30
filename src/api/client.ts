import { type ConfigureScope, type ProjectConfig, config } from "@/lib/config";
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

// Result of the interactive configure flow. The explicit status lets the
// caller honor the user's choice instead of inferring intent from a raw
// ProjectConfig: "configured" means a new/overwritten setup was built and
// should be persisted; "kept" means the user declined to change anything and
// nothing should be persisted.
export type ConfigureOutcome = {
    status: "configured" | "kept";
    scope: ConfigureScope;
    config: ProjectConfig;
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
    id?: string;
    name?: string;
    projects: Project[];
};

type Environment = {
    id: string;
    name: string;
};

type Team = {
    id: string;
    name: string;
};

export type ImportSecret = {
    key: string;
    value: string;
};

export type ImportTarget = {
    config: ProjectConfig;
    workspaceName: string;
    projectName: string;
    environmentName: string;
};

type Resource = Workspace | Project | ProjectTeam | Environment | Team | ApiSecret;

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

const CREATE_PROJECT_LABEL = "Create a new project";
const CREATE_ENVIRONMENT_LABEL = "Create a new environment";

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

    async configure(options: string, configureOptions?: { scope?: ConfigureScope }): Promise<ConfigureOutcome> {
        const scope = configureOptions?.scope ?? "path";
        const setup = await config.getConfigure(options, configureOptions);
        if (setup) {
            const overwrite = await confirm("Setup already exists. Overwrite?");
            if (!overwrite) {
                return { status: "kept", scope, config: setup };
            }
        } else if (scope === "git") {
            const pathSetup = await config.getConfigure(options, { scope: "path" });
            if (pathSetup) {
                const replace = await confirm(
                    "A path-only setup already exists for this directory. Replace it with a Git-repository setup?",
                );
                if (!replace) {
                    // The user declined: keep the existing path setup untouched
                    // and report the effective scope so nothing is persisted.
                    return { status: "kept", scope: "path", config: pathSetup };
                }
            }
        }

        const workspaces = await this.fetchResource<Workspace>("/v1/workspace");

        if (workspaces.length === 0) {
            throw new CLIError(
                "No workspaces found.",
                "Your account doesn't have any workspaces yet.",
                "Create a workspace in the Enkryptify dashboard first.",
                "/getting-started/quickstart",
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
                "/getting-started/quickstart",
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
                "/getting-started/quickstart",
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

        return { status: "configured", scope, config: projectConfig };
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
                "/getting-started/quickstart",
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

    async importSecrets(config: ProjectConfig, secrets: ImportSecret[]): Promise<void> {
        const { workspace_slug, project_slug, environment_id } = this.checkProjectConfig(config);

        await http.post(`/v1/workspace/${workspace_slug}/project/${project_slug}/secret`, {
            environments: [environment_id],
            secrets: secrets.map((secret) => ({
                key: secret.key,
                value: secret.value,
                type: "runtime",
                dataType: "text",
            })),
        });
    }

    async selectImportTarget(projectPath: string): Promise<ImportTarget> {
        const selectedWorkspace = await this.selectWorkspace();
        const selectedProject = await this.selectProject(selectedWorkspace);
        const selectedEnvironment = await this.selectEnvironment(selectedWorkspace, selectedProject);

        return {
            config: {
                path: projectPath,
                workspace_slug: selectedWorkspace.slug,
                project_slug: selectedProject.slug,
                environment_id: selectedEnvironment.id,
            },
            workspaceName: selectedWorkspace.name,
            projectName: selectedProject.name,
            environmentName: selectedEnvironment.name,
        };
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
                "Secret names can only contain letters (A-Z, a-z), numbers (0-9), underscores (_) and hyphens (-).",
            );
        }

        if (response.data.some((s) => s.name === newName && s.id !== existingSecret.id)) {
            throw new CLIError(
                `A secret named "${newName}" already exists.`,
                undefined,
                `Use "ek update ${newName}" to modify it or choose a different name.`,
            );
        }

        const newValue = await getSecureInput("Enter new value: ");
        if (!newValue || !newValue.trim()) {
            throw new CLIError("Secret value cannot be empty.", undefined, "Provide a non-empty value for the secret.");
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
            throw new CLIError("Could not delete the secret.", errorMessage);
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
                    if (status === 401) throw CLIError.from("API_UNAUTHORIZED");
                    if (status === 403) throw CLIError.from("API_FORBIDDEN");
                    if (status === 404) throw CLIError.from("API_NOT_FOUND");
                    if (status >= 500) throw CLIError.from("API_SERVER_ERROR");
                    throw new CLIError(
                        "Could not load data from the Enkryptify API.",
                        `The server returned an error (status ${status}).`,
                        'Check your permissions and try again. Run "ek login" if the issue persists.',
                    );
                }
                // Network-level errors (timeout, DNS, offline, etc.)
                throw CLIError.from("API_NETWORK_ERROR");
            }
            throw error;
        }
    }

    private async fetchOptionalResource<T>(url: string): Promise<T[]> {
        try {
            const response = await http.get<T[]>(url);
            return response.data ?? [];
        } catch (error) {
            if (error instanceof AxiosError && error.response?.status === 404) {
                return [];
            }
            if (error instanceof AxiosError) {
                const status = error.response?.status;
                if (status === 401) throw CLIError.from("API_UNAUTHORIZED");
                if (status === 403) throw CLIError.from("API_FORBIDDEN");
                if (status && status >= 500) throw CLIError.from("API_SERVER_ERROR");
                if (!status) throw CLIError.from("API_NETWORK_ERROR");
            }
            throw error;
        }
    }

    private async selectWorkspace(): Promise<Workspace> {
        const workspaces = await this.fetchResource<Workspace>("/v1/workspace");

        if (workspaces.length === 1) return first(workspaces);

        const workspaceMap = new Map<string, Workspace>();
        const workspaceLabels = workspaces.map((ws) => {
            const label = `${ws.name} (${ws.slug})`;
            workspaceMap.set(label, ws);
            return label;
        });

        const selectedWorkspaceLabel = await selectName(workspaceLabels, "Select workspace");
        const selectedWorkspace = workspaceMap.get(selectedWorkspaceLabel);
        if (!selectedWorkspace) {
            throw new CLIError(
                "The selected workspace could not be found.",
                undefined,
                'Try running "ek import" again.',
            );
        }

        return selectedWorkspace;
    }

    private async selectProject(workspace: Workspace): Promise<Project> {
        const projectsResponse = await this.fetchOptionalResource<ProjectTeam>(
            `/v1/workspace/${workspace.slug}/project`,
        );
        const projects = projectsResponse.flatMap((team) => team.projects ?? []);

        if (projects.length === 1) return first(projects);
        if (projects.length === 0) return this.createProjectInteractively(workspace);

        const projectMap = new Map<string, Project>();
        const projectLabels = projects.map((project) => {
            const label = `${project.name} (${project.slug})`;
            projectMap.set(label, project);
            return label;
        });

        const selectedProjectLabel = await selectName([...projectLabels, CREATE_PROJECT_LABEL], "Select project");
        if (selectedProjectLabel === CREATE_PROJECT_LABEL) {
            return this.createProjectInteractively(workspace);
        }

        const selectedProject = projectMap.get(selectedProjectLabel);
        if (!selectedProject) {
            throw new CLIError("The selected project could not be found.", undefined, 'Try running "ek import" again.');
        }

        return selectedProject;
    }

    private async selectEnvironment(workspace: Workspace, project: Project): Promise<Environment> {
        const environments = await this.fetchOptionalResource<Environment>(
            `/v1/workspace/${workspace.slug}/project/${project.slug}/environment`,
        );

        if (environments.length === 1) return first(environments);
        if (environments.length === 0) return this.createEnvironmentInteractively(workspace, project);

        const environmentName = await selectName(
            [...environments.map((environment) => environment.name), CREATE_ENVIRONMENT_LABEL],
            "Select environment",
        );

        if (environmentName === CREATE_ENVIRONMENT_LABEL) {
            return this.createEnvironmentInteractively(workspace, project);
        }

        const selectedEnvironment = environments.find((environment) => environment.name === environmentName);
        if (!selectedEnvironment) {
            throw new CLIError(
                "The selected environment could not be found.",
                undefined,
                'Try running "ek import" again.',
            );
        }

        return selectedEnvironment;
    }

    private async createProjectInteractively(workspace: Workspace): Promise<Project> {
        const teams = await this.fetchResource<Team>(`/v1/workspace/${workspace.slug}/team`);
        const selectedTeam = await this.selectTeam(teams);
        const name = (await getTextInput("Project name: ")).trim();
        if (!name) {
            throw new CLIError("Project name is required.", undefined, "Enter a project name to continue.");
        }

        const defaultSlug = slugify(name);
        const slugInput = (await getTextInput(`Project slug (press Enter to use "${defaultSlug}"): `)).trim();
        const slug = slugInput || defaultSlug;
        if (!slug) {
            throw new CLIError("Project slug is required.", undefined, "Enter a project slug to continue.");
        }

        const response = await http.post<Project>(`/v1/workspace/${workspace.slug}/project`, {
            name,
            slug,
            teamId: selectedTeam.id,
        });

        logger.success(`Project created successfully! Name: ${response.data.name}`);
        return response.data;
    }

    private async selectTeam(teams: Team[]): Promise<Team> {
        if (teams.length === 1) return first(teams);

        const teamMap = new Map<string, Team>();
        const teamLabels = teams.map((team) => {
            teamMap.set(team.name, team);
            return team.name;
        });

        const selectedTeamLabel = await selectName(teamLabels, "Select team for the new project");
        const selectedTeam = teamMap.get(selectedTeamLabel);
        if (!selectedTeam) {
            throw new CLIError("The selected team could not be found.", undefined, 'Try running "ek import" again.');
        }

        return selectedTeam;
    }

    private async createEnvironmentInteractively(workspace: Workspace, project: Project): Promise<Environment> {
        const name = (await getTextInput("Environment name: ")).trim();
        if (!name) {
            throw new CLIError("Environment name is required.", undefined, "Enter an environment name to continue.");
        }

        await http.post(`/v1/workspace/${workspace.slug}/project/${project.slug}/environment`, {
            name,
            hasPersonalOverrides: false,
        });

        const environments = await this.fetchResource<Environment>(
            `/v1/workspace/${workspace.slug}/project/${project.slug}/environment`,
        );
        const environment = environments.find((candidate) => candidate.name === name);
        if (!environment) {
            throw new CLIError(
                `Environment "${name}" was created but could not be loaded.`,
                undefined,
                'Try running "ek import" again.',
            );
        }

        logger.success(`Environment created successfully! Name: ${environment.name}`);
        return environment;
    }

    private checkProjectConfig(config: ProjectConfig) {
        const { workspace_slug, project_slug, environment_id } = config;
        if (!workspace_slug || !project_slug || !environment_id) {
            throw new CLIError(
                "Your project configuration is incomplete.",
                "The configuration file is missing required fields (workspace, project or environment).",
                'Run "ek configure" to set up your project.',
                "/cli/troubleshooting#configuration",
            );
        }
        return { workspace_slug, project_slug, environment_id };
    }
}

export const client = new EnkryptifyClient();

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function first<T>(items: T[]): T {
    const item = items[0];
    if (item === undefined) {
        throw new CLIError("Expected at least one item.");
    }
    return item;
}
