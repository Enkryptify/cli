import type { LoginOptions } from './AuthProvider.js';
import type { ProjectConfig } from '../../lib/config.js';

/**
 * Secret structure - normalized across all providers
 */
export interface Secret {
  /**
   * Secret name/key
   */
  name: string;
  /**
   * Secret value
   */
  value: string;
  /**
   * Optional provider-specific metadata
   */
  metadata?: {
    [key: string]: any;
  };
}

/**
 * Setup options passed to provider.setup()
 */
export interface SetupOptions {
  /**
   * Current directory path where setup is being performed
   */
  path: string;
  /**
   * Provider-specific options
   */
  [key: string]: any;
}

/**
 * Provider configuration - flexible structure
 * Each provider defines its own config shape
 * This is what gets passed to provider methods (run, createSecret, etc.)
 * Essentially ProjectConfig without the path field
 */
export interface ProviderConfig {
  /**
   * Provider name (e.g., "enkryptify", "aws", "gcp")
   */
  provider: string;
  /**
   * Provider-specific fields
   * Examples:
   * - Enkryptify: { workspace: string, project: string, environment: string }
   * - AWS: { region: string, secretName: string }
   * - GCP: { project: string, secretName: string }
   */
  [key: string]: any;
}

/**
 * Provider interface - all providers must implement this
 * 
 * Commands delegate to providers via this interface.
 * Each provider handles its own logic and auth checks internally.
 */
export interface Provider {
  /**
   * Provider name (e.g., "enkryptify", "aws", "gcp")
   * Used for registry lookup
   */
  readonly name: string;

  /**
   * Login to the provider
   * Handles authentication (OAuth, credentials, etc.)
   * Stores tokens in keyring internally
   * 
   * @param options Optional login options (e.g., force re-authentication)
   */
  login(options?: LoginOptions): Promise<void>;

  /**
   * Setup provider-specific configuration for a project
   * Handles provider-specific setup flow (interactive selection, prompts, etc.)
   * Checks authentication internally (throws if not authenticated)
   * 
   * @param options Setup options including current directory path
   * @returns ProjectConfig to be saved to .enkryptify.json
   */
  setup(options: SetupOptions): Promise<ProjectConfig>;

  /**
   * Fetch secrets from the provider 
   * Interprets provider-specific config structure
   * Checks authentication internally (throws if not authenticated)
   * 
   * @param config Provider-specific configuration
   * @returns Array of normalized secrets
   */
  run(config: ProviderConfig): Promise<Secret[]>;

  /**
   * Create a new secret
   * Checks authentication internally (throws if not authenticated)
   * 
   * @param config Provider-specific configuration
   * @param name Secret name/key
   * @param value Secret value
   */
  createSecret(
    config: ProviderConfig,
    name: string,
    value: string
  ): Promise<void>;

  /**
   * Update an existing secret
   * Checks authentication internally (throws if not authenticated)
   * 
   * @param config Provider-specific configuration
   * @param name Secret name/key
   * @param value New secret value
   */
  updateSecret(
    config: ProviderConfig,
    name: string,
    value: string
  ): Promise<void>;

  /**
   * Delete a secret
   * Checks authentication internally (throws if not authenticated)
   * Handles "not found" gracefully (no error if secret doesn't exist)
   * 
   * @param config Provider-specific configuration
   * @param name Secret name/key
   */
  deleteSecret(config: ProviderConfig, name: string): Promise<void>;

  /**
   * List all secrets
   * Checks authentication internally (throws if not authenticated)
   * 
   * @param config Provider-specific configuration
   * @returns Array of normalized secrets
   */
  listSecrets(config: ProviderConfig): Promise<Secret[]>;
}