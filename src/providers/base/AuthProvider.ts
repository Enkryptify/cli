export interface Credentials {
    [key: string]: string;
}

export type LoginOptions = {
    providerName: string;
    force?: boolean;
    key?: string;
};

export interface AuthProvider {
    login(options?: LoginOptions): Promise<void>;

    getCredentials(): Promise<Credentials>;
}
