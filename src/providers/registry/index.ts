import { AwsProvider } from "@/providers/aws/provider";
import { EnkryptifyProvider } from "@/providers/enkryptify/provider";
import { GcpProvider } from "@/providers/gcp/provider";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";

providerRegistry.register(new EnkryptifyProvider());
providerRegistry.register(new AwsProvider());
providerRegistry.register(new GcpProvider());
export { AwsProvider, GcpProvider, providerRegistry };
