import { Box, Text, render } from "ink";
import SelectInput from "ink-select-input";

export async function confirm(message: string): Promise<boolean> {
    const items = [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
    ];

    return new Promise((resolve) => {
        const confirm = render(
            <Box flexDirection="column">
                {message && (
                    <Box marginBottom={1}>
                        <Text bold>{message}</Text>
                    </Box>
                )}
                <Box flexDirection="column">
                    <SelectInput
                        items={items}
                        onSelect={(item) => {
                            confirm.unmount();
                            process.stdout.write("\x1b[2J\x1b[H");
                            resolve(item.value === "yes");
                        }}
                    />
                </Box>
            </Box>,
        );
    });
}
