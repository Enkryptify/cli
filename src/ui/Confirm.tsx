import prompts from "prompts";

export async function confirm(message: string): Promise<boolean> {
    const response = await prompts({
        type: "confirm",
        name: "value",
        message: message,
        initial: false,
    });

    if (response.value === undefined) {
        throw new Error("Input cancelled");
    }

    return response.value as boolean;
}
