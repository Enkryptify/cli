import { type ProjectConfig, config } from "@/lib/config";
import { getSecureInput, getTextInput } from "@/lib/input";
import { confirm } from "@/ui/Confirm";
import { selectName } from "@/ui/SelectItem";
import { showMessage } from "@/ui/SuccessMessage";
import { type Client, ItemCategory, createClient } from "@1password/sdk";
import dotenv from "dotenv";
import type { LoginOptions } from "../base/AuthProvider";
import type { Provider, Secret, runOptions } from "../base/Provider";
import { OnePasswordAuth } from "./auth";

type ParsedNote = { key: string; value: string };

function parseEnvLine(line: string): ParsedNote | null {
    try {
        const parsed = dotenv.parse(line);
        const entries = Object.entries(parsed);

        if (entries.length !== 1) return null;

        const entry = entries[0];
        if (!entry) return null;

        const [key, value] = entry;
        return { key, value };
    } catch {
        return null;
    }
}

function ensureVaultId(config: ProjectConfig): string {
    if (!config.vaultId) {
        throw new Error("Vault ID is not set. Run setup first.");
    }
    return config.vaultId;
}

function parseNotes(notes: string): ParsedNote[] {
    return notes
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map(parseEnvLine)
        .filter((v): v is ParsedNote => Boolean(v));
}

async function getSecureNotes(client: Client, vaultId: string) {
    try {
        const items = await client.items.list(vaultId);
        return items.filter((i) => i.category === ItemCategory.SecureNote);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch Secure Notes from vault: ${message}`);
    }
}

async function getSecureNoteByTitle(client: Client, vaultId: string, title: string) {
    try {
        const notes = await getSecureNotes(client, vaultId);
        const overview = notes.find((n) => n.title === title);
        if (!overview) throw new Error(`Secure Note "${title}" not found.`);

        const full = await client.items.get(vaultId, overview.id);
        if (!full.notes?.trim()) {
            throw new Error(`Secure Note "${title}" has no content.`);
        }

        return full;
    } catch (error: unknown) {
        if (error instanceof Error && error.message.includes("Secure Note")) {
            throw error; // Re-throw our custom errors as-is
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch Secure Note "${title}": ${message}`);
    }
}

export class OnePasswordProvider implements Provider {
    readonly name = "onePassword";

    private readonly auth = new OnePasswordAuth();
    private client?: Client;

    async login(options?: LoginOptions): Promise<void> {
        await this.auth.login(options);
        this.client = undefined;
    }

    private async getClient(): Promise<Client> {
        if (this.client) return this.client;

        try {
            const { token } = await this.auth.getCredentials();
            if (!token) {
                throw new Error(`Not logged in. Run "ek login --provider onePassword".`);
            }

            this.client = await createClient({
                auth: token,
                integrationName: "Enkryptify",
                integrationVersion: "1.0.0",
            });

            return this.client;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to initialize 1Password client: ${message}`);
        }
    }

    async configure(path: string): Promise<ProjectConfig> {
        try {
            const existing = await config.getConfigure(path);

            if (existing && !(await confirm("Setup already exists. Overwrite?"))) {
                return existing;
            }

            const client = await this.getClient();
            const vaults = await client.vaults.list();

            if (!vaults.length) throw new Error("No vaults found.");

            const labels = vaults.map((v) => `${v.title} (${v.id})`);
            const selected = await selectName(labels, "Select vault");
            const vault = vaults.find((v) => `${v.title} (${v.id})` === selected);

            if (!vault) throw new Error("Vault selection failed.");

            const projectConfig: ProjectConfig = {
                path,
                provider: this.name,
                vaultId: vault.id,
                vaultTitle: vault.title,
            };

            showMessage(`Vault selected: ${vault.title}`);
            return projectConfig;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to configure 1Password: ${message}`);
        }
    }

    async run(config: ProjectConfig, _?: runOptions): Promise<Secret[]> {
        try {
            const vaultId = ensureVaultId(config);
            const client = await this.getClient();

            const notes = await getSecureNotes(client, vaultId);
            const secrets: Secret[] = [];

            for (const note of notes) {
                try {
                    const full = await client.items.get(vaultId, note.id);
                    if (!full.notes) continue;

                    for (const entry of parseNotes(full.notes)) {
                        secrets.push({
                            name: entry.key,
                            value: entry.value,
                        });
                    }
                } catch (error: unknown) {
                    // Log but continue processing other notes
                    const message = error instanceof Error ? error.message : String(error);
                    console.warn(`Failed to fetch note "${note.title}": ${message}`);
                }
            }

            return secrets;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch secrets from 1Password: ${message}`);
        }
    }

    async createSecret(config: ProjectConfig, noteName: string, value: string): Promise<void> {
        try {
            if (!value || value.trim().length === 0) {
                throw new Error("Secret value cannot be empty.");
            }

            const vaultId = ensureVaultId(config);
            const client = await this.getClient();

            const parentName = noteName?.trim();
            if (!parentName) {
                throw new Error("Secure Note name is required. Example: ek create <noteName>");
            }

            const keyName = (await getTextInput("Enter secret key name: "))?.trim();
            if (!keyName) {
                throw new Error("Secret key name is required.");
            }

            const notes = await getSecureNotes(client, vaultId);
            const existing = notes.find((n) => n.title === parentName);

            if (!existing) {
                await client.items.create({
                    category: ItemCategory.SecureNote,
                    vaultId,
                    title: parentName,
                    notes: `${keyName}=${value}`,
                });

                showMessage(`Secret created! Note: "${parentName}", Key: "${keyName}"`);
                return;
            }

            const full = await client.items.get(vaultId, existing.id);
            const currentNotes = full.notes?.trim() ?? "";

            const updatedNotes = currentNotes ? `${currentNotes}\n${keyName}=${value}` : `${keyName}=${value}`;

            await client.items.put({
                ...full,
                notes: updatedNotes,
            });

            showMessage(`Secret added! Note: "${parentName}", Key: "${keyName}"`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to create secret in 1Password: ${message}`);
        }
    }

    async updateSecret(config: ProjectConfig, noteName: string): Promise<void> {
        try {
            const vaultId = ensureVaultId(config);
            const client = await this.getClient();

            const note = await getSecureNoteByTitle(client, vaultId, noteName);

            const renamedNote =
                (await getTextInput(`Rename Secure Note? (current: "${note.title}", Enter to keep): `))?.trim() ||
                note.title;

            const entries = parseNotes(note.notes);
            if (!entries.length) throw new Error("No secrets found.");

            const selectedKey = (await getTextInput("Enter key to update: "))?.trim();
            if (!selectedKey) throw new Error("Key required.");

            const entry = entries.find((e) => e.key === selectedKey);
            if (!entry) throw new Error(`Key "${selectedKey}" not found.`);

            const renamedKey =
                (await getTextInput(`Rename key? (current: "${selectedKey}", Enter to keep): `))?.trim() || selectedKey;

            const newValue = (await getSecureInput(`Enter new value for "${renamedKey}": `))?.trim();
            if (!newValue) throw new Error("Value cannot be empty.");

            const updatedNotes = entries
                .map((e) => (e.key === selectedKey ? `${renamedKey}=${newValue}` : `${e.key}=${e.value}`))
                .join("\n");

            await client.items.put({
                ...note,
                title: renamedNote,
                notes: updatedNotes,
            });

            showMessage(`Updated "${renamedKey}" in "${renamedNote}".`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to update secret in 1Password: ${message}`);
        }
    }

    async deleteSecret(config: ProjectConfig, name: string): Promise<void> {
        try {
            const vaultId = ensureVaultId(config);
            const client = await this.getClient();

            const notes = await getSecureNotes(client, vaultId);
            const note = notes.find((n) => n.title === name);

            if (!note) throw new Error(`Secure Note "${name}" not found.`);

            await client.items.delete(vaultId, note.id);
            showMessage(`Deleted "${name}".`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete secret "${name}": ${message}`);
        }
    }

    async listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]> {
        try {
            const vaultId = ensureVaultId(config);
            const client = await this.getClient();
            const reveal = showValues === "show";

            const notes = await getSecureNotes(client, vaultId);
            const secrets: Secret[] = [];

            for (const note of notes) {
                const full = await client.items.get(vaultId, note.id);
                if (!full.notes) continue;

                for (const { key, value } of parseNotes(full.notes)) {
                    secrets.push({
                        name: key,
                        value: reveal ? value : "********",
                    });
                }
            }

            return secrets;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to list secrets in 1Password: ${message}`);
        }
    }
}
