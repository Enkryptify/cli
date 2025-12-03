import { EnkryptifyProvider } from "@/providers/enkryptfiy/provider.js";
import { providerRegistry } from "@/providers/registry/ProviderRegistry.js";

providerRegistry.register(new EnkryptifyProvider());

export { providerRegistry };
