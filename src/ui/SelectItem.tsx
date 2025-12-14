import { Box, Text, render } from "ink";
import SelectInput from "ink-select-input";

export async function selectName(options: string[], title?: string): Promise<string> {
    const items = options.map((name, index) => ({
        label: name,
        value: name,
        key: `${name}-${index}`,
    }));
    return new Promise((resolve) => {
        const select = render(
            <Box flexDirection="column" padding={1}>
                {title && (
                    <Box marginBottom={1}>
                        <Text bold>{title}</Text>
                    </Box>
                )}
                <Box flexDirection="column">
                    <SelectInput
                        items={items}
                        onSelect={(item) => {
                            select.unmount();
                            process.stdout.write("\x1b[2J\x1b[H");
                            resolve(item.value as string);
                        }}
                    />
                </Box>
            </Box>,
        );
    });
}
