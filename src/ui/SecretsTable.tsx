import type { Secret } from "@/providers/base/Provider";
import { Box, Text, render, useStdout } from "ink";

const MAX_ROWS_TO_DISPLAY = 100;

function truncateValue(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength - 3) + "...";
}

function SecretsList({ secrets }: { secrets: Secret[] }) {
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;
    const nameColumnWidth = Math.min(25, Math.floor(columns * 0.25));
    const valueMaxLength = Math.max(15, columns - nameColumnWidth - 8);

    const displaySecrets = secrets.slice(0, MAX_ROWS_TO_DISPLAY);
    const hasMore = secrets.length > MAX_ROWS_TO_DISPLAY;

    return (
        <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={1}>
            <Box flexDirection="row" marginBottom={1}>
                <Box minWidth={nameColumnWidth}>
                    <Text bold>Name</Text>
                </Box>
                <Box flexGrow={1} minWidth={1}>
                    <Text bold>Value</Text>
                </Box>
            </Box>
            <Box borderTop={true} marginBottom={1} />
            {displaySecrets.map((secret, index) => {
                const truncatedValue = truncateValue(secret.value, valueMaxLength);
                const namePadding = " ".repeat(Math.max(0, nameColumnWidth - secret.name.length));

                return (
                    <Box key={secret.id || index} flexDirection="column">
                        <Box flexDirection="row" flexWrap="wrap">
                            <Box minWidth={nameColumnWidth}>
                                <Text>
                                    {secret.name}
                                    {namePadding}
                                </Text>
                            </Box>
                            <Box flexGrow={1} minWidth={1}>
                                <Text wrap="wrap">{truncatedValue}</Text>
                            </Box>
                        </Box>
                        {index < displaySecrets.length - 1 && <Box borderTop={true} marginY={0} />}
                    </Box>
                );
            })}
            {hasMore && (
                <Box marginTop={1} borderTop={true} paddingTop={1}>
                    <Text dimColor>... and {secrets.length - MAX_ROWS_TO_DISPLAY} more secrets</Text>
                </Box>
            )}
        </Box>
    );
}

export function showSecretsTable(secrets: Secret[]): void {
    if (secrets.length === 0) {
        console.log("No secrets found.");
        return;
    }

    const table = render(<SecretsList secrets={secrets} />);
    process.nextTick(() => {
        table.unmount();
    });
}
