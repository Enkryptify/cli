import { Box, Text, render } from "ink";
import SelectInput from "ink-select-input";

export async function selectName(options: string[], title?: string): Promise<string> {
    if (!options.length) throw new Error("options array cannot be empty");

    const items = options.map((name, index) => ({
        label: name,
        value: name,
        key: `${name}-${index}`,
    }));

    return new Promise((resolve) => {
        const app = render(
            <Box flexDirection="column">
                {title ? (
                    <Box marginBottom={1}>
                        <Text bold>{title}</Text>
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
