import prompts from "prompts";

export async function selectName(options: string[], title?: string): Promise<string> {
    if (!options.length) throw new Error("options array cannot be empty");

    const response = await prompts(
        {
            type: "select",
            name: "value",
            message: title || "Select an option",
            choices: options.map((name) => ({
                title: name,
                value: name,
            })),
            initial: 0,
        },
        {
            onCancel: () => {
                process.exit(130);
            },
        },
    );

    const selectedValue: unknown = response.value;
    if (typeof selectedValue !== "string" || selectedValue.length === 0) {
        throw new Error("No option selected");
    }

    return selectedValue;
}
