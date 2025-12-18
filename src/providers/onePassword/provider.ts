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

function ensureVaultAndNote(config: ProjectConfig): { vaultId: string; noteId: string } {
    if (!config.vaultId) {
        throw new Error("Vault ID is not set. Run setup first.");
    }
    if (!config.noteId) {
        throw new Error("Note ID is not set. Run setup first.");
    }
    return { vaultId: config.vaultId, noteId: config.noteId };
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

            const notes = await getSecureNotes(client, vault.id);

            if (!notes.length) throw new Error(`No Secure Notes found in vault "${vault.title}".`);

            const noteLabels = notes.map((n) => n.title || "Untitled");
            const selectedNote = await selectName(noteLabels, "Select Secure Note");

            const note = notes.find((n) => n.title === selectedNote);
            if (!note) throw new Error("Secure Note selection failed.");

            const projectConfig: ProjectConfig = {
                path,
                provider: this.name,
                vaultId: vault.id,
                vaultTitle: vault.title,
                noteName: note.title,
                noteId: note.id,
            };

            showMessage(`Vault selected: ${vault.title}, Note selected: ${note.title}`);
            return projectConfig;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to configure 1Password: ${message}`);
        }
    }

    async run(config: ProjectConfig, options?: runOptions): Promise<Secret[]> {
        try {
            const { vaultId, noteId: defaultNoteId } = ensureVaultAndNote(config);
            const client = await this.getClient();

            let targetNoteId = defaultNoteId;

            if (options?.env) {
                const notes = await getSecureNotes(client, vaultId);
                const targetNote = notes.find((n) => n.title === options.env);
                if (!targetNote) {
                    const availableNotes = notes.map((n) => n.title).join(", ");
                    throw new Error(
                        `Secure Note "${options.env}" not found. Available notes: ${availableNotes || "none"}`,
                    );
                }
                targetNoteId = targetNote.id;
            }

            const note = await client.items.get(vaultId, targetNoteId);
            if (!note.notes) {
                return [];
            }

            const secrets: Secret[] = [];
            for (const entry of parseNotes(note.notes)) {
                secrets.push({
                    name: entry.key,
                    value: entry.value,
                });
            }

            return secrets;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch secrets from 1Password: ${message}`);
        }
    }

    async createSecret(config: ProjectConfig, keyName: string, value: string): Promise<void> {
        try {
            if (!value || value.trim().length === 0) {
                throw new Error("Secret value cannot be empty.");
            }

            if (!keyName || !keyName.trim()) {
                throw new Error("Secret key name is required. Example: ek create <keyName>");
            }

            const { vaultId, noteId } = ensureVaultAndNote(config);
            const client = await this.getClient();

            const note = await client.items.get(vaultId, noteId);
            const currentNotes = note.notes?.trim() ?? "";

            if (currentNotes) {
                const entries = parseNotes(currentNotes);
                const existingKey = entries.find((e) => e.key === keyName.trim());
                if (existingKey) {
                    throw new Error(`Key "${keyName}" already exists in note "${note.title}". Use update instead.`);
                }
            }

            const updatedNotes = currentNotes
                ? `${currentNotes}\n${keyName.trim()}=${value}`
                : `${keyName.trim()}=${value}`;

            await client.items.put({
                ...note,
                notes: updatedNotes,
            });

            showMessage(`Secret added! Note: "${note.title}", Key: "${keyName}"`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to create secret in 1Password: ${message}`);
        }
    }

    async updateSecret(config: ProjectConfig, keyName: string): Promise<void> {
        try {
            if (!keyName || !keyName.trim()) {
                throw new Error("Key name is required. Please provide a key name.");
            }

            const { vaultId, noteId } = ensureVaultAndNote(config);
            const client = await this.getClient();

            const note = await client.items.get(vaultId, noteId);
            if (!note.notes) {
                throw new Error("Note has no content.");
            }

            const entries = parseNotes(note.notes);
            if (!entries.length) throw new Error("No secrets found.");

            const selectedKey = keyName.trim();
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
                notes: updatedNotes,
            });

            showMessage(`Updated "${renamedKey}" in "${note.title}".`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to update secret in 1Password: ${message}`);
        }
    }

    async deleteSecret(config: ProjectConfig, keyName: string): Promise<void> {
        try {
            if (!keyName || !keyName.trim()) {
                throw new Error("Key name is required. Please provide a key name.");
            }

            const { vaultId, noteId } = ensureVaultAndNote(config);
            const client = await this.getClient();

            const note = await client.items.get(vaultId, noteId);
            if (!note.notes) {
                throw new Error("Note has no content.");
            }

            const entries = parseNotes(note.notes);
            const filtered = entries.filter((e) => e.key !== keyName.trim());

            if (filtered.length === entries.length) {
                throw new Error(`Key "${keyName}" not found in note "${note.title}".`);
            }

            const updatedNotes = filtered.map((e) => `${e.key}=${e.value}`).join("\n");

            await client.items.put({
                ...note,
                notes: updatedNotes,
            });

            showMessage(`Deleted key "${keyName}" from note "${note.title}".`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete secret "${keyName}": ${message}`);
        }
    }

    async listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]> {
        try {
            const { vaultId, noteId } = ensureVaultAndNote(config);
            const client = await this.getClient();
            const reveal = showValues === "show";

            const full = await client.items.get(vaultId, noteId);
            if (!full.notes) {
                return [];
            }

            const secrets: Secret[] = [];
            for (const { key, value } of parseNotes(full.notes)) {
                secrets.push({
                    name: key,
                    value: reveal ? value : "********",
                });
            }

            return secrets;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to list secrets in 1Password: ${message}`);
        }
    }
}
