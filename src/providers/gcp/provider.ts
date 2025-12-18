import { type ProjectConfig, config } from "@/lib/config";
import { getSecureInput } from "@/lib/input";
import { confirm } from "@/ui/Confirm";
import { selectName } from "@/ui/SelectItem";
import { showMessage } from "@/ui/SuccessMessage";
import type { LoginOptions } from "../base/AuthProvider";
import type { Provider, Secret, runOptions } from "../base/Provider";
import { GcpAuth } from "./auth";
import httpClient from "./httpClient";

export class GcpProvider implements Provider {
    private readonly RESOURCE_MANAGER_API = process.env.GCP_RESOURCE_MANAGER_API;

    readonly name = "gcp";
    private auth: GcpAuth;

    constructor() {
        this.auth = new GcpAuth();
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

        try {
            const response = await httpClient.get<{
                projects?: Array<{ projectId?: string; name?: string; displayName?: string }>;
            }>(`${this.RESOURCE_MANAGER_API}/projects`);

            const projects = response.data.projects ?? [];
            if (projects.length === 0) {
                throw new Error("No projects found. Please create a project first before setting up.");
            }

            const labels = projects.map((p) => {
                const name = p.displayName ?? p.name ?? "Unnamed project";
                const id = p.projectId ?? "unknown-id";
                return `${name}/${id}`;
            });

            const selected = await selectName(labels, "Select project");
            if (!selected) throw new Error("Failed to select project");

            const selectedId = selected.split("/").pop();
            if (!selectedId) throw new Error("Failed to parse selected project id");

            const project = projects.find((p) => p.projectId === selectedId);
            if (!project || !project.name || !project.projectId) {
                throw new Error("Failed to find selected project");
            }

            const projectConfig: ProjectConfig = {
                path: options,
                provider: this.name,
                projectName: project.name,
                projectId: project.projectId,
            };

            showMessage(`Setup completed successfully! Project: ${project.name}/(${project.projectId})`);
            return projectConfig;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to configure GCP project: ${message}`);
        }
    }

    async run(config: ProjectConfig, options?: runOptions): Promise<Secret[]> {
        const { projectId } = config;
        if (!projectId) {
            throw new Error("Project id is not set. Configure the GCP project first.");
        }

        return this.getAllSecretsWithAllVersions(projectId, options?.env);
    }

    async createSecret(config: ProjectConfig, name: string, value: string): Promise<void> {
        const { projectId } = config;

        if (!projectId) {
            throw new Error("Project id is not set. Configure GCP first.");
        }

        if (!name?.trim()) {
            throw new Error("Secret name is required.");
        }

        if (!value?.trim()) {
            throw new Error("Secret value is required.");
        }

        const parent = `projects/${projectId}`;
        const secretPath = `${parent}/secrets/${name}`;

        if (await this.secretExists(secretPath)) {
            throw new Error(`Secret "${name}" already exists. Use "update" command to add a new version.`);
        }

        try {
            await httpClient.post(`/${parent}/secrets?secretId=${name}`, {
                replication: { automatic: {} },
            });

            await httpClient.post(`/${secretPath}:addVersion`, {
                payload: {
                    data: Buffer.from(value, "utf8").toString("base64"),
                },
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to create secret "${name}": ${message}`);
        }
    }
    private async secretExists(secretPath: string): Promise<boolean> {
        try {
            await httpClient.get(`/${secretPath}`);
            return true;
        } catch {
            return false;
        }
    }

    async updateSecret(config: ProjectConfig, name: string, _isPersonal?: boolean): Promise<void> {
        const { projectId } = config;
        if (!projectId) {
            throw new Error("Project id is not set. Configure GCP first.");
        }

        if (!name?.trim()) {
            throw new Error("Secret name is required.");
        }

        const secretName = `projects/${projectId}/secrets/${name}`;

        if (!(await this.secretExists(secretName))) {
            throw new Error(`Secret "${name}" not found.`);
        }

        const newValue = await getSecureInput(`Enter new value for "${name}": `);

        if (!newValue?.trim()) {
            throw new Error("Secret value cannot be empty.");
        }

        try {
            await httpClient.post(`/${secretName}:addVersion`, {
                payload: {
                    data: Buffer.from(newValue, "utf8").toString("base64"),
                },
            });
            console.log(`✅ Secret "${name}" updated successfully`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to update secret "${name}": ${message}`);
        }
    }

    async deleteSecret(config: ProjectConfig, name: string): Promise<void> {
        const { projectId } = config;
        if (!projectId) {
            throw new Error("Project id is not set. Configure GCP first.");
        }

        if (!name?.trim()) {
            throw new Error("Secret name is required.");
        }

        const secretName = `projects/${projectId}/secrets/${name}`;

        if (!(await this.secretExists(secretName))) {
            throw new Error(`Secret "${name}" not found.`);
        }

        try {
            await httpClient.delete(`/${secretName}`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete secret "${name}": ${message}`);
        }
    }

    async listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]> {
        const { projectId } = config;
        if (!projectId) {
            throw new Error("Project id is not set. Configure the GCP project first.");
        }

        const shouldShow = showValues === "show";
        const allSecrets = await this.getAllSecretsWithAllVersions(projectId);

        return allSecrets.map((s) => ({
            ...s,
            value: shouldShow ? s.value : "****************",
        }));
    }

    async getAllSecretsWithAllVersions(projectId: string, env?: string): Promise<Secret[]> {
        const parent = env ? `projects/${env}` : `projects/${projectId}`;

        try {
            const secretsResponse = await httpClient.get<{ secrets?: Array<{ name?: string }> }>(`/${parent}/secrets`);

            const secrets = secretsResponse.data.secrets ?? [];
            if (secrets.length === 0) {
                throw new Error("No secrets found in project. Please create a secret first.");
            }

            const all: Secret[] = [];

            for (const meta of secrets) {
                if (!meta.name) continue;

                const secretId = meta.name.split("/").pop()!;

                const versionsResponse = await httpClient.get<{ versions?: Array<{ name?: string }> }>(
                    `/${meta.name}/versions`,
                );

                const versions = versionsResponse.data.versions ?? [];

                for (const v of versions) {
                    if (!v.name) continue;

                    const versionResponse = await httpClient.get<{
                        payload?: { data?: string };
                    }>(`/${v.name}:access`);

                    const encodedData = versionResponse.data.payload?.data;
                    const value = encodedData ? Buffer.from(encodedData, "base64").toString("utf8") : "";

                    all.push({
                        id: `${secretId}:${v.name.split("/").pop()}`,
                        name: secretId,
                        value,
                    });
                }
            }

            return all;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch all secrets and versions for project "${projectId}": ${message}`);
        }
    }
}
