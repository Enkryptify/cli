import { Box, render, Text } from "ink";

interface SuccessMessageProps {
    message: string;
    details?: string[];
}

function SuccessDisplay({ message, details }: SuccessMessageProps) {
    return (
        <Box flexDirection="column" justifyContent="center" alignItems="center" height="100%" paddingTop={2}>
            <Box flexDirection="column" alignItems="center" marginBottom={3}>
                <Box marginBottom={1}>
                    <Text bold color="greenBright" inverse>
                        {" "}
                        ✓ SUCCESS{" "}
                    </Text>
                </Box>
                <Box>
                    <Text bold color="greenBright" dimColor={false}>
                        {message}
                    </Text>
                </Box>
            </Box>
            {details && details.length > 0 && (
                <Box
                    flexDirection="column"
                    marginTop={2}
                    paddingX={3}
                    paddingY={2}
                    borderStyle="round"
                    borderColor="green"
                    minWidth={60}
                >
                    {details.map((detail, index) => (
                        <Text key={index} color="white" dimColor={false}>
                            {detail}
                        </Text>
                    ))}
                </Box>
            )}
        </Box>
    );
}

export function showSuccessMessage(message: string, details?: string[]): void {
    render(<SuccessDisplay message={message} details={details} />);
}
