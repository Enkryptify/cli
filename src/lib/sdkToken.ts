import http from "@/api/httpClient";

export async function createSdkToken(workspaceSlug: string, environmentId: string): Promise<string> {
    const { data } = await http.post<{ token: string }>(
        `/v1/workspace/${workspaceSlug}/tokens/cli`,
        { environmentId },
    );
    return data.token;
}
