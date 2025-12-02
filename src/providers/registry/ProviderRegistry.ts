import type { Provider } from '../base/Provider.js';
import { config as authConfig } from '../../lib/config.js';

/**
 * Central registry for all providers
 * 
 * Provides a single place to find providers.
 * Commands don't need to know about specific providers.
 */
export class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();


  register(provider: Provider): void {
    this.providers.set(provider.name, provider);
  }


  get(name: string): Provider | undefined {
    return this.providers.get(name);
  }


  async getDefault(): Promise<Provider | undefined> {
    const defaultProviderName = await authConfig.getDefaultProvider();
    if (!defaultProviderName) {
      return undefined;
    }
    return this.get(defaultProviderName);
  }


  list(): Provider[] {
    return Array.from(this.providers.values());
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }
}

export const providerRegistry = new ProviderRegistry();

