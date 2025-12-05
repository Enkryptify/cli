import prompts from "prompts";

export async function getSecureInput(prompt: string): Promise<string> {
    const response = await prompts({
        type: "password",
        name: "value",
        message: prompt,
        validate: (value: string) => {
            if (!value || value.trim().length === 0) {
                return "Value cannot be empty";
            }
            return true;
        },
    });

    if (!response.value) {
        throw new Error("Input cancelled or empty");
    }

    return response.value;
}

export async function getTextInput(prompt: string): Promise<string> {
    const response = await prompts({
        type: "text",
        name: "value",
        message: prompt,
    });

    return response.value || "";
}
