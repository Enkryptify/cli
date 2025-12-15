import { AwsProvider } from "@/providers/aws/provider";
import { EnkryptifyProvider } from "@/providers/enkryptfiy/provider";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";

providerRegistry.register(new EnkryptifyProvider());
providerRegistry.register(new AwsProvider());

export { AwsProvider, providerRegistry };
