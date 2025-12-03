export interface Credentials {
    [key: string]: any;
    // Examples:
    // Enkryptify: { accessToken: string, refreshToken?: string }
    // AWS: { accessKeyId: string, secretAccessKey: string, sessionToken?: string }
    // GCP: { credentials: ServiceAccountCredentials }
}

export interface LoginOptions {
    force?: boolean;

    [key: string]: any;
}

export interface AuthProvider {
    login(options?: LoginOptions): Promise<void>;

    getCredentials(): Promise<Credentials>;
}
