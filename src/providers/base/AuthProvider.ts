export interface Credentials {
    [key: string]: any;
}

export interface LoginOptions {
    force?: boolean;

    [key: string]: any;
}

export interface AuthProvider {
    login(options?: LoginOptions): Promise<void>;

    getCredentials(): Promise<Credentials>;
}
