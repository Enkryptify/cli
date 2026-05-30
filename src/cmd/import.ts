import { promises as fs } from "node:fs";
import path from "node:path";
import { type ImportSecret, client } from "@/api/client";
import { analytics } from "@/lib/analytics";
import { config } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { secretNameSchema } from "@/validators/secret";
import { confirm } from "@/ui/Confirm";
import type { Command } from "commander";
import { z } from "zod";

type ParsedLine = {
    key: string;
    value: string;
    line: number;
};

const ASSIGNMENT_PATTERN = /^\s*(?:export\s+)?([A-Za-z0-9_-]+)\s*=\s*(.*)$/;

export function parseDotenvContent(content: string): ImportSecret[] {
    const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
    const parsed: ParsedLine[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index] ?? "";
        const trimmedLine = rawLine.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) continue;

        const match = rawLine.match(ASSIGNMENT_PATTERN);
        if (!match) {
            throw new CLIError(
                `Could not parse .env line ${index + 1}.`,
                `Expected KEY=value but found: ${trimmedLine}`,
                "Check the file for malformed entries and try again.",
            );
        }

        const key = match[1] ?? "";
        const valueStart = match[2] ?? "";
        const { value, endLine } = parseValue(valueStart, lines, index);
        parsed.push({ key, value, line: index + 1 });
        index = endLine;
    }

    validateParsedSecrets(parsed);

    return parsed.map(({ key, value }) => ({ key, value }));
}

export async function importCommand(file = ".env"): Promise<{ workspace_slug: string; imported: number }> {
    const authenticated = await config.isAuthenticated();
    if (!authenticated) {
        throw CLIError.from("AUTH_NOT_LOGGED_IN");
    }

    const filePath = path.resolve(process.cwd(), file);
    const content = await readEnvFile(filePath);
    const secrets = parseDotenvContent(content);

    if (secrets.length === 0) {
        throw new CLIError("No secrets found.", `The file "${filePath}" does not contain any KEY=value entries.`);
    }

    const target = await client.selectImportTarget(process.cwd());
    await client.importSecrets(target.config, secrets);

    logger.success(
        `Imported ${secrets.length} secret${secrets.length === 1 ? "" : "s"} into ${target.workspaceName}/${target.projectName}/${target.environmentName}.`,
    );

    const shouldDelete = await confirm(`Delete ${filePath}?`);
    if (shouldDelete) {
        await fs.unlink(filePath);
        logger.success(`Deleted ${filePath}.`);
    }

    return { workspace_slug: target.config.workspace_slug ?? "", imported: secrets.length };
}

export function registerImportCommand(program: Command) {
    program
        .command("import")
        .description("Import secrets from a .env file into Enkryptify")
        .argument("[file]", 'Path to a dotenv file. Defaults to ".env".')
        .action(async (file?: string) => {
            const tracker = analytics.trackCommand("command_import");

            try {
                const result = await importCommand(file ?? ".env");
                tracker.success({
                    workspace_slug: result.workspace_slug,
                    imported: String(result.imported),
                });
            } catch (error: unknown) {
                tracker.error(error);
                if (error instanceof CLIError) {
                    logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                } else {
                    logger.error(error instanceof Error ? error.message : String(error));
                }
                process.exit(1);
            }
        });
}

async function readEnvFile(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, "utf8");
    } catch (error: unknown) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
        if (code === "ENOENT") {
            throw new CLIError(
                "File not found.",
                `Could not find "${filePath}".`,
                "Pass a file path or create a .env file.",
            );
        }
        throw error;
    }
}

function parseValue(valueStart: string, lines: string[], startLine: number): { value: string; endLine: number } {
    const trimmedStart = valueStart.trimStart();
    if (trimmedStart.startsWith('"')) {
        return parseQuotedValue(trimmedStart.slice(1), lines, startLine, '"');
    }
    if (trimmedStart.startsWith("'")) {
        return parseQuotedValue(trimmedStart.slice(1), lines, startLine, "'");
    }

    return {
        value: stripInlineComment(valueStart).trim(),
        endLine: startLine,
    };
}

function parseQuotedValue(
    firstFragment: string,
    lines: string[],
    startLine: number,
    quote: '"' | "'",
): { value: string; endLine: number } {
    const fragments = [firstFragment];
    let currentLine = startLine;

    while (currentLine < lines.length) {
        const current = fragments[fragments.length - 1] ?? "";
        const closingIndex = findClosingQuote(current, quote, fragments.length > 1);
        if (closingIndex !== -1) {
            const beforeQuote = current.slice(0, closingIndex);
            const afterQuote = current.slice(closingIndex + 1).trim();
            if (afterQuote && !afterQuote.startsWith("#")) {
                throw new CLIError(
                    `Could not parse .env line ${currentLine + 1}.`,
                    "Unexpected characters after a quoted value.",
                    "Move comments after quoted values behind a # or remove the extra characters.",
                );
            }

            fragments[fragments.length - 1] = beforeQuote;
            const rawValue = fragments.join("\n");
            return {
                value: quote === '"' ? decodeDoubleQuotedValue(rawValue) : rawValue,
                endLine: currentLine,
            };
        }

        currentLine += 1;
        if (currentLine >= lines.length) break;
        fragments.push(lines[currentLine] ?? "");
    }

    throw new CLIError(
        `Could not parse .env line ${startLine + 1}.`,
        "A quoted value was not closed.",
        "Add the missing quote and try again.",
    );
}

function findClosingQuote(value: string, quote: '"' | "'", isMultilineContinuation: boolean): number {
    if (quote === '"' && isMultilineContinuation && /^\s*"[^"]+"\s*:/.test(value)) {
        return -1;
    }

    for (let index = 0; index < value.length; index += 1) {
        if (value[index] !== quote) continue;
        if (quote === '"' && isEscaped(value, index)) continue;

        const rest = value.slice(index + 1).trim();
        if (!isMultilineContinuation || rest.length === 0 || rest.startsWith("#")) {
            return index;
        }
    }

    return -1;
}

function isEscaped(value: string, quoteIndex: number): boolean {
    let slashCount = 0;
    for (let index = quoteIndex - 1; index >= 0 && value[index] === "\\"; index -= 1) {
        slashCount += 1;
    }
    return slashCount % 2 === 1;
}

function stripInlineComment(value: string): string {
    let result = "";
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (char === "#" && (index === 0 || /\s/.test(value[index - 1] ?? ""))) break;
        result += char;
    }
    return result;
}

function decodeDoubleQuotedValue(value: string): string {
    return value.replace(/\\([nrt"\\])/g, (_match, escaped: string) => {
        switch (escaped) {
            case "n":
                return "\n";
            case "r":
                return "\r";
            case "t":
                return "\t";
            case '"':
                return '"';
            case "\\":
                return "\\";
            default:
                return escaped;
        }
    });
}

function validateParsedSecrets(parsed: ParsedLine[]): void {
    const seen = new Set<string>();

    for (const secret of parsed) {
        try {
            secretNameSchema.parse(secret.key);
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new CLIError(
                    `Invalid secret name "${secret.key}" on line ${secret.line}.`,
                    error.issues.map((issue) => issue.message).join(" "),
                    "Secret names must match Enkryptify's secret naming rules.",
                );
            }
            throw error;
        }

        if (secret.value.length === 0) {
            throw new CLIError(
                `Secret "${secret.key}" has an empty value on line ${secret.line}.`,
                undefined,
                "Remove the entry or provide a value before importing.",
            );
        }

        if (seen.has(secret.key)) {
            throw new CLIError(
                `Duplicate secret "${secret.key}" found on line ${secret.line}.`,
                undefined,
                "Remove duplicate entries before importing.",
            );
        }
        seen.add(secret.key);
    }
}
