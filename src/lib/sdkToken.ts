import http from "@/api/httpClient";

export async function createSdkToken(workspaceSlug: string, environmentId: string): Promise<string> {
    if (!workspaceSlug || typeof workspaceSlug !== "string") {
        throw new Error("createSdkToken requires a non-empty workspaceSlug");
    }
    if (!environmentId || typeof environmentId !== "string") {
        throw new Error("createSdkToken requires a non-empty environmentId");
    }

    const encodedSlug = encodeURIComponent(workspaceSlug);

    try {
        const { data } = await http.post<{ token: string }>(`/v1/workspace/${encodedSlug}/tokens/cli`, {
            environmentId,
        });
        return data.token;
    } catch (error) {
        throw new Error(
            `Failed to create SDK token for workspace "${workspaceSlug}" (environment: ${environmentId}): ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
