import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDotenvContent } from "@/cmd/import";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("parseDotenvContent", () => {
    it("parses common dotenv syntax", () => {
        const secrets = parseDotenvContent(`
# Comment
PLAIN=value
WITH_EXPORT=one
export EXPORTED=two
DOUBLE="hello\\nworld"
SINGLE='hello # world'
INLINE=value # comment
URL=https://example.com/#hash
`);

        expect(secrets).toEqual([
            { key: "PLAIN", value: "value" },
            { key: "WITH_EXPORT", value: "one" },
            { key: "EXPORTED", value: "two" },
            { key: "DOUBLE", value: "hello\nworld" },
            { key: "SINGLE", value: "hello # world" },
            { key: "INLINE", value: "value" },
            { key: "URL", value: "https://example.com/#hash" },
        ]);
    });

    it("parses multiline quoted values", () => {
        const secrets = parseDotenvContent(`PRIVATE_KEY="-----BEGIN KEY-----
abc
-----END KEY-----"
JSON_VALUE="{
"type": "service_account",
"private_key": "line one\\nline two"
}"`);

        expect(secrets).toEqual([
            { key: "PRIVATE_KEY", value: "-----BEGIN KEY-----\nabc\n-----END KEY-----" },
            {
                key: "JSON_VALUE",
                value: '{\n"type": "service_account",\n"private_key": "line one\nline two"\n}',
            },
        ]);
    });

    it("parses the provided sample env file", async () => {
        const content = await fs.readFile(path.join(__dirname, "../fixtures/test.env"), "utf8");
        const secrets = parseDotenvContent(content);

        expect(secrets).toHaveLength(13);
        expect(secrets.find((secret) => secret.key === "SYNC_GITHUB_PRIVATE_KEY")?.value).toContain(
            "-----BEGIN RSA PRIVATE KEY-----",
        );
        expect(secrets.find((secret) => secret.key === "GOOGLE_JSON")?.value).toContain('"type": "service_account"');
    });

    it("rejects malformed lines", () => {
        expect(() => parseDotenvContent("NOT VALID")).toThrow("Could not parse .env line 1");
    });

    it("rejects duplicate keys", () => {
        expect(() => parseDotenvContent("API_KEY=one\nAPI_KEY=two")).toThrow('Duplicate secret "API_KEY"');
    });

    it("rejects empty values because the API cannot create them", () => {
        expect(() => parseDotenvContent('EMPTY_QUOTED=""')).toThrow('Secret "EMPTY_QUOTED" has an empty value');
    });
});
