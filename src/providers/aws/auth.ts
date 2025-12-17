import { config } from "@/lib/config";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import type { AuthProvider, Credentials, LoginOptions } from "../base/AuthProvider";

export class AwsAuth implements AuthProvider {
    private readonly PROVIDER_NAME = "aws";
    private readonly awsClient = new STSClient({});

    async login(_options?: LoginOptions): Promise<void> {
        try {
            const result = await this.awsClient.send(new GetCallerIdentityCommand({}));

            console.log("✅ AWS authentication successful");
            console.log("Account:", result.Account);
            console.log("ARN:", result.Arn);
            await config.updateProvider(this.PROVIDER_NAME, {});
        } catch (err: unknown) {
            console.error("❌ AWS authentication failed", err instanceof Error ? err.message : String(err));
            console.error(
                "Make sure you are logged in by running:\n" +
                    "  aws configure  (for access keys)\n" +
                    "  aws sso login  (for SSO)",
            );

            throw new Error("AWS authentication failed");
        }
    }

    getCredentials(): Promise<Credentials> {
        throw new Error("Method not implemented.");
    }
}
