import type { ProjectConfig } from "@/lib/config";
import type { LoginOptions } from "@/providers/base/AuthProvider";

export type Secret = {
    id: string;
    name: string;
    value: string;
    isPersonal: boolean;
    environmentId: string;
};

export type runOptions = {
    env?: string;
    [key: string]: string | undefined;
};

export type ProviderConfig = {
    provider: string;
    [key: string]: string;
};

export interface Provider {
    readonly name: string;

    login(options?: LoginOptions): Promise<void>;

    configure(options: string): Promise<ProjectConfig>;

    run(config: ProviderConfig, options?: runOptions): Promise<Secret[]>;

    createSecret(config: ProjectConfig, name: string, value: string): Promise<void>;

    updateSecret(config: ProjectConfig, name: string, isPersonal?: boolean): Promise<void>;

    deleteSecret(config: ProjectConfig, name: string): Promise<void>;

    listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]>;
}
