/**
 * Credentials structure - provider-specific
 * Each provider defines its own credential shape
 */
export interface Credentials {
    [key: string]: any;
    // Examples:
    // Enkryptify: { accessToken: string, refreshToken?: string }
    // AWS: { accessKeyId: string, secretAccessKey: string, sessionToken?: string }
    // GCP: { credentials: ServiceAccountCredentials }
  }
  
  /**
   * Login options passed to auth providers
   */
  export interface LoginOptions {
    /**
     * Force re-authentication even if already authenticated
     */
    force?: boolean;
    /**
     * Provider-specific options
     */
    [key: string]: any;
  }
  
  /**
   * Authentication provider interface
   * 
   * Used internally by providers to handle authentication logic.
   * Commands don't interact with this directly - they call provider.login() instead.
   */
  export interface AuthProvider {
   
    /**
     * Perform login flow (OAuth, credential verification, etc.)
     * @param options Optional login options (e.g., force re-authentication)
     */
    login(options?: LoginOptions): Promise<void>;
  
    /**
     * Logout and remove stored credentials
     */
    logout(): Promise<void>;
  
    /**
     * Get stored credentials/token
     * @returns Credentials object (provider-specific structure)
     * @throws Error if not authenticated
     */
    getCredentials(): Promise<Credentials>;
  

  }