import { providerRegistry } from './ProviderRegistry.js';
import { EnkryptifyProvider } from '../enkryptfiy/provider.js';

providerRegistry.register(new EnkryptifyProvider());

export { providerRegistry };

