import type { Finding } from "@/lib/betterleaks";
import { Box, Text, render, useStdout } from "ink";
import * as path from "path";

const MAX_ROWS_TO_DISPLAY = 100;

// betterleaks reports absolute paths; show them relative to the scanned directory.
function relativeFile(file: string): string {
    const rel = path.relative(process.cwd(), file);
    return rel && !rel.startsWith("..") ? rel : file;
}

// Mask a secret so the report never prints it in full: keep a few edge characters.
function redact(secret: string): string {
    const value = secret ?? "";
    if (value.length <= 6) return "*".repeat(Math.max(value.length, 3));
    return `${value.slice(0, 3)}${"*".repeat(6)}${value.slice(-2)}`;
}

function ScanFindings({ findings }: { findings: Finding[] }) {
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;

    const display = findings.slice(0, MAX_ROWS_TO_DISPLAY);
    const hasMore = findings.length > MAX_ROWS_TO_DISPLAY;

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1} paddingY={1}>
            <Box marginBottom={1}>
                <Text bold color="red">
                    ⚠ {findings.length} secret{findings.length !== 1 ? "s" : ""} found
                </Text>
            </Box>
            {display.map((finding, index) => {
                const location = `${relativeFile(finding.File)}:${finding.StartLine}`;
                const maxLocation = Math.max(20, columns - 4);

                return (
                    <Box
                        key={`${location}-${index}`}
                        flexDirection="column"
                        marginBottom={index < display.length - 1 ? 1 : 0}
                    >
                        <Text bold color="yellow">
                            {finding.RuleID}
                        </Text>
                        <Text>
                            {"  "}
                            {location.length > maxLocation
                                ? "…" + location.slice(location.length - maxLocation + 1)
                                : location}
                        </Text>
                        <Text dimColor>
                            {"  Secret: "}
                            {redact(finding.Secret || finding.Match)}
                        </Text>
                    </Box>
                );
            })}
            {hasMore && (
                <Box marginTop={1} borderTop={true} paddingTop={1}>
                    <Text dimColor>... and {findings.length - MAX_ROWS_TO_DISPLAY} more findings</Text>
                </Box>
            )}
        </Box>
    );
}

// Awaitable so the box is fully painted before the caller prints anything below it.
export async function showScanReport(findings: Finding[]): Promise<void> {
    if (findings.length === 0) return;

    const report = render(<ScanFindings findings={findings} />);
    await new Promise<void>((resolve) => process.nextTick(resolve));
    report.unmount();
    await report.waitUntilExit();
}
