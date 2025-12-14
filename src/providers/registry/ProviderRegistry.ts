import type { Provider } from "@/providers/base/Provider";

export class ProviderRegistry {
    private providers: Map<string, Provider> = new Map();

    register(provider: Provider): void {
        this.providers.set(provider.name, provider);
    }

    get(name: string): Provider | undefined {
        return this.providers.get(name);
    }

    list(): Provider[] {
        return Array.from(this.providers.values());
    }

    has(name: string): boolean {
        return this.providers.has(name);
    }
}

export const providerRegistry = new ProviderRegistry();
