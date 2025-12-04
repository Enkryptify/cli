import type { Secret } from "@/providers/base/Provider.js";
import { Box, Text, render } from "ink";

interface SecretsTableProps {
    secrets: Secret[];
}

const MAX_VALUE_WIDTH = 60;
const HEADERS = ["Name", "Value", "isPersonal", "environmentId"] as const;

function truncateMiddle(value: string, max: number): string {
    if (value.length <= max) return value;
    if (max <= 3) return value.slice(0, max);

    const half = Math.floor((max - 3) / 2);
    return `${value.slice(0, half)}...${value.slice(-half)}`;
}

function buildTableLines(secrets: Secret[]): string[] {
    const rows = secrets.map((s) => [
        s.name,
        truncateMiddle(s.value, MAX_VALUE_WIDTH),
        String(s.isPersonal),
        s.environmentId,
    ]);

    const colWidths = HEADERS.map((header, i) => {
        const maxDataWidth = Math.max(...rows.map((row) => row[i]?.length ?? 0));
        return Math.max(header.length, maxDataWidth);
    });

    const border = `+${colWidths.map((w) => "=".repeat(w + 2)).join("+")}+`;

    const formatRow = (cells: string[]) => `|${cells.map((cell, i) => ` ${cell.padEnd(colWidths[i]!)} `).join("|")}|`;

    const lines = [border, formatRow([...HEADERS]), border];

    if (rows.length === 0) {
        lines.push(formatRow(["<no secrets>", "", "", ""]));
    } else {
        rows.forEach((row) => lines.push(formatRow(row)));
    }

    lines.push(border);
    return lines;
}

function SecretsTable({ secrets }: SecretsTableProps) {
    const lines = buildTableLines(secrets);

    return (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
            <Box marginBottom={1} justifyContent="center">
                <Text bold color="cyanBright">
                    Injected Secrets
                </Text>
            </Box>
            <Box flexDirection="column">
                {lines.map((line, idx) => (
                    <Text key={idx}>{line}</Text>
                ))}
            </Box>
        </Box>
    );
}

export function showSecretsTable(secrets: Secret[]): void {
    render(<SecretsTable secrets={secrets} />);
}
