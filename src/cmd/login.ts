import { providerRegistry } from '../providers/registry/ProviderRegistry.js';
import { config as authConfig } from '../lib/config.js';
import type { LoginOptions } from '../providers/base/AuthProvider.js';

export async function runLogin(
  providerName?: string,
  options?: LoginOptions
): Promise<void> {
  const abortController = new AbortController();

  process.once('SIGINT', () => {
    console.log('\n  Login cancelled by user');
    abortController.abort();
  });

  let finalProviderName: string;
  
  if (providerName) {
    const provider = providerRegistry.get(providerName);
    if (provider) {
      finalProviderName = providerName;
    } else {
      const defaultProvider = await authConfig.getDefaultProvider();
      if (!defaultProvider) {
        throw new Error(
          `Provider "${providerName}" not found and no default provider set. Available providers: ${providerRegistry
            .list()
            .map((p) => p.name)
            .join(', ')}`
        );
      }
      finalProviderName = defaultProvider;
    }
  } else {
    const defaultProvider = await authConfig.getDefaultProvider();
    if (!defaultProvider) {
      throw new Error(
        'No provider specified and no default provider set. Please specify a provider: ek login <provider>'
      );
    }
    finalProviderName = defaultProvider;
  }

  const provider = providerRegistry.get(finalProviderName);
  if (!provider) {
    throw new Error(
      `Provider "${finalProviderName}" not found. Available providers: ${providerRegistry
        .list()
        .map((p) => p.name)
        .join(', ')}`
    );
  }

  await provider.login({ ...options, signal: abortController.signal });

  await authConfig.markAuthenticated(finalProviderName, {
    last_login: Date.now(),
  });

  const currentDefault = await authConfig.getDefaultProvider();
  if (!currentDefault) {
    await authConfig.setDefaultProvider(finalProviderName);
  }
}

