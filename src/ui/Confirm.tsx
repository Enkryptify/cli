import { Box, Text, render } from "ink";
import SelectInput from "ink-select-input";

export async function confirm(message: string): Promise<boolean> {
    const items = [
        { label: "Yes", value: true },
        { label: "No", value: false },
    ];

    return new Promise((resolve) => {
        const app = render(
            <Box flexDirection="column">
                {message ? (
                    <Box marginBottom={1}>
                        <Text bold>{message}</Text>
                    </Box>
                ) : null}

                <SelectInput
                    items={items}
                    onSelect={(item) => {
                        app.clear();
                        app.unmount();
                        resolve(item.value);
                    }}
                />
            </Box>,
        );
    });
}
