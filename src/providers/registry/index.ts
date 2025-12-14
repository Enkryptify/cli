import { EnkryptifyProvider } from "@/providers/enkryptfiy/provider";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";

providerRegistry.register(new EnkryptifyProvider());
export { providerRegistry };
