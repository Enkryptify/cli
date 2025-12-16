import { AwsProvider } from "@/providers/aws/provider";
import { EnkryptifyProvider } from "@/providers/enkryptfiy/provider";
import { GcpProvider } from "@/providers/gcp/provider";
import { OnePasswordProvider } from "@/providers/onePassword/provider";
import { providerRegistry } from "@/providers/registry/ProviderRegistry";

providerRegistry.register(new EnkryptifyProvider());
providerRegistry.register(new AwsProvider());
providerRegistry.register(new GcpProvider());
providerRegistry.register(new OnePasswordProvider());
export { AwsProvider, GcpProvider, OnePasswordProvider, providerRegistry };
