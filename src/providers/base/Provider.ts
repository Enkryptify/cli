import type { ProjectConfig } from "@/lib/config.js";
import type { LoginOptions } from "@/providers/base/AuthProvider.js";

export interface Secret {
    id: string;

    name: string;

    value: string;

    isPersonal: boolean;

    environmentId: string;
}
export interface runOptions {
    env?: string;

    [key: string]: string | undefined;
}

export interface ProviderConfig {
    provider: string;

    [key: string]: string;
}

export interface Provider {
    readonly name: string;

    login(options?: LoginOptions): Promise<void>;

    configure(options: string): Promise<ProjectConfig>;

    run(config: ProviderConfig, options?: runOptions): Promise<Secret[]>;

    createSecret(config: ProjectConfig, name: string, value: string): Promise<void>;

    updateSecret(config: ProjectConfig, name: string): Promise<void>;

    deleteSecret(config: ProviderConfig): Promise<void>;

    listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]>;
}
