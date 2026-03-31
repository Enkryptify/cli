import { env } from "@/env";
import { config as configManager } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { keyring } from "@/lib/keyring";
import http from "@/api/httpClient";
import { createHash, randomBytes } from "crypto";
import open from "open";
import { URL } from "url";

export type Credentials = {
    [key: string]: string;
};

export type LoginOptions = {
    force?: boolean;
};

type UserInfo = {
    id: string;
    email: string;
    name: string;
};

type AuthResponse = {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
};

type StoredAuthData = {
    accessToken: string;
    userId: string;
    email: string;
};

function base64Url(buf: Buffer) {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+/g, "");
}

export class Auth {
    private readonly KEYRING_KEY = "enkryptify";
    private readonly CLIENT_ID = "enkryptify-cli";
    private readonly REDIRECT_URL = "http://localhost:51823/callback";
    private readonly CALLBACK_PORT = 51823;
    private readonly DEFAULT_SCOPES = "openid profile email secrets:read secrets:write";

    async login(options?: LoginOptions): Promise<void> {
        let envToken: string | undefined;

        try {
            const creds = await this.getCredentials();
            envToken = creds.accessToken;
        } catch (error: unknown) {
            logger.debug(error instanceof Error ? error.message : String(error));
            envToken = undefined;
        }

        if (envToken) {
            if (options?.force) {
                await keyring.delete(this.KEYRING_KEY);
            } else {
                const isAuth = await this.getUserInfo(envToken).catch(() => false);
                if (isAuth) {
                    logger.info(
                        'Already logged in. Use "ek login --force" to re-authenticate with a different account.',
                    );

                    await configManager.markAuthenticated();
                    return;
                } else {
                    await keyring.delete(this.KEYRING_KEY);
                }
            }
        }

        const codeVerifier = base64Url(randomBytes(32));
        const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
        const state = base64Url(randomBytes(32));

        const authResponse = await this.runPkceFlow({
            codeVerifier,
            codeChallenge,
            state,
        });

        const userInfo = await this.getUserInfo(authResponse.accessToken);
        if (!userInfo) {
            throw new CLIError(
                "Could not retrieve your account information.",
                "Authentication succeeded but the server failed to return your profile.",
                'Try running "ek login" again.',
            );
        }

        await this.markAuthenticated(authResponse.accessToken, userInfo);
    }

    private async runPkceFlow(params: {
        codeVerifier: string;
        codeChallenge: string;
        state: string;
    }): Promise<AuthResponse> {
        const { codeVerifier, codeChallenge, state } = params;

        return new Promise<AuthResponse>((resolve, reject) => {
            let server: ReturnType<typeof Bun.serve> | null = null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            const cleanup = () => {
                void server?.stop();
                if (timeoutId) clearTimeout(timeoutId);
                server = null;
                timeoutId = null;
            };

            const fail = (error: Error) => {
                cleanup();
                reject(error);
            };

            const handleCallback = async (req: Request): Promise<Response> => {
                try {
                    const url = new URL(req.url);
                    const error = url.searchParams.get("error");
                    const errorDesc = url.searchParams.get("error_description") || error || "";

                    if (error) {
                        setTimeout(() => {
                            fail(new CLIError(`Authentication failed: ${errorDesc}`));
                        }, 1000);
                        return this.authErrorResponse(errorDesc);
                    }

                    if (url.searchParams.get("state") !== state) {
                        setTimeout(() => {
                            fail(
                                new CLIError(
                                    "Authentication failed due to a security mismatch.",
                                    "The authentication response could not be verified. This can happen if the login session expired.",
                                    'Run "ek login" to try again.',
                                ),
                            );
                        }, 1000);
                        return this.authErrorResponse("Invalid state parameter");
                    }

                    const code = url.searchParams.get("code");
                    if (!code) {
                        setTimeout(() => {
                            fail(
                                new CLIError(
                                    "Authentication failed. No authorization was received.",
                                    "The browser did not return a valid authorization code. You may have denied access or the flow was interrupted.",
                                    'Run "ek login" to try again.',
                                ),
                            );
                        }, 1000);
                        return this.authErrorResponse("Missing authorization code");
                    }

                    const authResp = await this.exchangeCodeForToken(code, codeVerifier);

                    setTimeout(() => {
                        cleanup();
                        resolve(authResp);
                    }, 1000);

                    return this.authSuccessResponse();
                } catch (err: unknown) {
                    setTimeout(() => {
                        fail(err instanceof Error ? err : new Error(String(err)));
                    }, 1000);
                    return new Response("Internal error", { status: 500 });
                }
            };

            try {
                server = Bun.serve({
                    port: this.CALLBACK_PORT,
                    routes: { "/callback": handleCallback },
                    fetch: () => new Response("Not Found", { status: 404 }),
                });
            } catch {
                reject(
                    new CLIError(
                        "Could not start the login server.",
                        `Port ${this.CALLBACK_PORT} is already in use by another application.`,
                        "Close the application using that port and try again.",
                    ),
                );
                return;
            }

            const authUrl = this.buildAuthUrl(codeChallenge, state);
            this.logAuthInstructions(authUrl);

            open(authUrl).catch((openErr: unknown) => {
                logger.warn("Failed to open browser automatically.", {
                    fix: `Open this URL manually: ${authUrl}`,
                });
                logger.debug(String(openErr));
            });

            timeoutId = setTimeout(
                () => {
                    fail(
                        new CLIError(
                            "Authentication timed out.",
                            "No response was received from the browser within the time limit.",
                            'Run "ek login" to try again. Make sure to complete the login in your browser.',
                        ),
                    );
                },
                5 * 60 * 1000,
            );
        });
    }

    private buildAuthUrl(codeChallenge: string, state: string): string {
        const authUrl = new URL("/oauth/authorize", env.APP_BASE_URL);
        authUrl.searchParams.set("client_id", this.CLIENT_ID);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("redirect_uri", this.REDIRECT_URL);
        authUrl.searchParams.set("scope", this.DEFAULT_SCOPES);
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");

        return authUrl.toString();
    }

    private logAuthInstructions(authUrl: string): void {
        logger.info("Opening browser for authentication...");
        logger.info(`Authentication URL: ${authUrl}`);
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private authErrorResponse(message: string): Response {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sign-in failed — Enkryptify</title>
<link rel="icon" href="https://app.enkryptify.com/favicon.ico"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Source Sans 3',system-ui,-apple-system,sans-serif;background:#0e1a26;margin:0;min-height:100vh;padding:24px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
.panel{background:#15202e;border-radius:16px;min-height:calc(100vh - 48px);display:flex;flex-direction:column;padding:32px}
.logo{flex-shrink:0}
.center{flex:1;display:flex;align-items:center;justify-content:center}
.content{display:flex;flex-direction:column;align-items:center;text-align:center;gap:24px;max-width:340px;opacity:0;transform:translateY(8px);animation:up .45s .12s cubic-bezier(.16,1,.3,1) forwards}
@keyframes up{to{opacity:1;transform:none}}
.icon svg{display:block}
.ring{fill:none;stroke:#cf4040;stroke-width:2;opacity:.25}
.x1,.x2{fill:none;stroke:#cf4040;stroke-width:2.5;stroke-linecap:round;stroke-dasharray:26;stroke-dashoffset:26}
.x1{animation:draw .3s .4s cubic-bezier(.4,0,.2,1) forwards}
.x2{animation:draw .3s .52s cubic-bezier(.4,0,.2,1) forwards}
@keyframes draw{to{stroke-dashoffset:0}}
h1{font-size:18px;font-weight:600;color:#e4e8ec;letter-spacing:-.01em;margin:0}
.desc{font-size:14px;color:#7b8d9e;line-height:1.55;margin:0}
.hint{font-size:13px;color:#4a5c6b;margin:0}
</style>
</head>
<body>
<div class="panel">
    <div class="logo"><svg width="140" height="28" viewBox="0 0 2069 321" fill="none"><path d="M380 0H321.747L191.218 159.551L321.747 319.103H380L250.549 159.551L380 0Z" fill="#2B7FFF"/><path d="M274.038 0H0V319.103H273.233L161.996 182.19H90.7176V228.546H140.396L178.195 273.824H45.0186V45.2781H177.115L140.396 91.0881H90.7176V136.912H163.076L274.038 0Z" fill="#2B7FFF"/><path d="M505.52 273V46.51H658.002V82.557H546.99V141.572H654.174V177.3H546.99V236.953H660.554V273H505.52ZM698.59 273V102.654H735.594L737.189 150.504L732.404 148.59C734.105 136.681 737.614 127.111 742.931 119.88C748.247 112.649 754.734 107.333 762.39 103.93C770.046 100.527 778.446 98.826 787.591 98.826C800.138 98.826 810.665 101.591 819.172 107.12C827.891 112.649 834.484 120.305 838.95 130.088C843.416 139.658 845.649 150.823 845.649 163.583V273H804.817V176.662C804.817 167.092 803.86 159.011 801.946 152.418C800.032 145.825 796.842 140.828 792.376 137.425C788.122 133.81 782.38 132.002 775.15 132.002C764.304 132.002 755.584 135.83 748.992 143.486C742.612 151.142 739.422 162.201 739.422 176.662V273H698.59ZM887.373 273V46.51H928.205V179.533L998.066 102.654H1048.47L981.797 173.472L1050.7 273H1004.76L955.001 197.716L928.205 226.107V273H887.373ZM1074.29 273V102.654H1112.57L1114.16 149.866L1110.65 149.228C1113.21 132.853 1117.99 121.05 1125.01 113.819C1132.24 106.376 1142.02 102.654 1154.36 102.654H1169.99V137.744H1154.04C1145.32 137.744 1138.09 139.02 1132.35 141.572C1126.6 144.124 1122.24 148.165 1119.27 153.694C1116.5 159.011 1115.12 166.029 1115.12 174.748V273H1074.29ZM1209.46 320.85V289.269H1231.15C1236.68 289.269 1240.72 288.418 1243.27 286.717C1246.04 285.016 1248.17 282.145 1249.65 278.104L1254.44 266.301H1242.64L1181.71 102.654H1224.13L1266.88 228.021L1307.71 102.654H1350.14L1283.47 290.864C1279.64 301.497 1274.22 309.153 1267.2 313.832C1260.39 318.511 1250.82 320.85 1238.49 320.85H1209.46ZM1372.1 320.85V102.654H1411.34L1412.3 139.02L1408.15 137.106C1412.4 124.559 1419.32 115.095 1428.89 108.715C1438.67 102.122 1450.05 98.826 1463.02 98.826C1479.18 98.826 1492.58 102.867 1503.21 110.948C1514.06 119.029 1522.14 129.769 1527.46 143.167C1532.77 156.565 1535.43 171.452 1535.43 187.827C1535.43 204.202 1532.67 219.089 1527.14 232.487C1521.82 245.885 1513.74 256.625 1502.89 264.706C1492.26 272.787 1478.86 276.828 1462.7 276.828C1454.19 276.828 1446.22 275.339 1438.77 272.362C1431.54 269.385 1425.27 265.131 1419.95 259.602C1414.85 254.073 1411.23 247.586 1409.11 240.143L1412.94 236.953V320.85H1372.1ZM1453.13 243.652C1465.46 243.652 1475.14 238.761 1482.16 228.978C1489.39 218.983 1493 205.266 1493 187.827C1493 170.388 1489.39 156.778 1482.16 146.995C1475.14 137 1465.46 132.002 1453.13 132.002C1444.84 132.002 1437.71 134.129 1431.76 138.382C1425.8 142.423 1421.12 148.59 1417.72 156.884C1414.53 165.178 1412.94 175.492 1412.94 187.827C1412.94 200.162 1414.53 210.476 1417.72 218.77C1420.91 227.064 1425.48 233.338 1431.44 237.591C1437.6 241.632 1444.84 243.652 1453.13 243.652ZM1629.46 273C1612.45 273 1599.9 269.066 1591.82 261.197C1583.95 253.328 1580.02 240.994 1580.02 224.193V62.779H1620.85V220.365C1620.85 228.234 1622.55 233.763 1625.96 236.953C1629.36 239.93 1634.67 241.419 1641.91 241.419H1665.83V273H1629.46ZM1553.22 134.235V102.654H1665.83V134.235H1553.22ZM1695.78 273V102.654H1736.61V273H1695.78ZM1695.14 80.005V43.639H1737.57V80.005H1695.14ZM1789.65 273V95.955C1789.65 80.643 1793.91 68.6273 1802.41 59.908C1811.13 50.976 1824.42 46.51 1842.29 46.51H1875.46V78.091H1849.94C1843.35 78.091 1838.46 79.7923 1835.27 83.195C1832.29 86.5977 1830.8 91.5953 1830.8 98.188V273H1789.65ZM1765.41 138.701V107.12H1873.23V138.701H1765.41ZM1920.67 320.85V289.269H1942.36C1947.89 289.269 1951.93 288.418 1954.48 286.717C1957.25 285.016 1959.37 282.145 1960.86 278.104L1965.65 266.301H1953.84L1892.92 102.654H1935.34L1978.09 228.021L2018.92 102.654H2061.35L1994.68 290.864C1990.85 301.497 1985.43 309.153 1978.41 313.832C1971.6 318.511 1962.03 320.85 1949.7 320.85H1920.67Z" fill="#EDEDED"/></svg></div>
    <div class="center">
        <div class="content">
            <div class="icon"><svg viewBox="0 0 64 64" width="64" height="64"><circle class="ring" cx="32" cy="32" r="30"/><line class="x1" x1="23" y1="23" x2="41" y2="41"/><line class="x2" x1="41" y1="23" x2="23" y2="41"/></svg></div>
            <div>
                <h1>We couldn't sign you in</h1>
                <p class="desc" style="margin-top:6px">${this.escapeHtml(message)}</p>
            </div>
            <p class="hint">Close this tab and try again from your terminal.</p>
        </div>
    </div>
</div>
</body>
</html>`;
        return new Response(html, { status: 400, headers: { "Content-Type": "text/html" } });
    }

    private authSuccessResponse(): Response {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Signed in — Enkryptify</title>
<link rel="icon" href="https://app.enkryptify.com/favicon.ico"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Source Sans 3',system-ui,-apple-system,sans-serif;background:#0e1a26;margin:0;min-height:100vh;padding:24px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
.panel{background:#15202e;border-radius:16px;min-height:calc(100vh - 48px);display:flex;flex-direction:column;padding:32px}
.logo{flex-shrink:0}
.center{flex:1;display:flex;align-items:center;justify-content:center}
.content{display:flex;flex-direction:column;align-items:center;text-align:center;gap:24px;max-width:340px;opacity:0;transform:translateY(8px);animation:up .45s .12s cubic-bezier(.16,1,.3,1) forwards}
@keyframes up{to{opacity:1;transform:none}}
.icon svg{display:block}
.ring{fill:none;stroke:#2ac769;stroke-width:2;stroke-dasharray:189;stroke-dashoffset:189;animation:draw .65s .3s cubic-bezier(.4,0,.2,1) forwards}
.check{fill:none;stroke:#2ac769;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:36;stroke-dashoffset:36;animation:draw .35s .82s cubic-bezier(.4,0,.2,1) forwards}
@keyframes draw{to{stroke-dashoffset:0}}
h1{font-size:18px;font-weight:600;color:#e4e8ec;letter-spacing:-.01em;margin:0}
.desc{font-size:14px;color:#7b8d9e;line-height:1.55;margin:0}
.hint{font-size:13px;color:#4a5c6b;margin:0}
</style>
</head>
<body>
<div class="panel">
    <div class="logo"><svg width="140" height="28" viewBox="0 0 2069 321" fill="none"><path d="M380 0H321.747L191.218 159.551L321.747 319.103H380L250.549 159.551L380 0Z" fill="#2B7FFF"/><path d="M274.038 0H0V319.103H273.233L161.996 182.19H90.7176V228.546H140.396L178.195 273.824H45.0186V45.2781H177.115L140.396 91.0881H90.7176V136.912H163.076L274.038 0Z" fill="#2B7FFF"/><path d="M505.52 273V46.51H658.002V82.557H546.99V141.572H654.174V177.3H546.99V236.953H660.554V273H505.52ZM698.59 273V102.654H735.594L737.189 150.504L732.404 148.59C734.105 136.681 737.614 127.111 742.931 119.88C748.247 112.649 754.734 107.333 762.39 103.93C770.046 100.527 778.446 98.826 787.591 98.826C800.138 98.826 810.665 101.591 819.172 107.12C827.891 112.649 834.484 120.305 838.95 130.088C843.416 139.658 845.649 150.823 845.649 163.583V273H804.817V176.662C804.817 167.092 803.86 159.011 801.946 152.418C800.032 145.825 796.842 140.828 792.376 137.425C788.122 133.81 782.38 132.002 775.15 132.002C764.304 132.002 755.584 135.83 748.992 143.486C742.612 151.142 739.422 162.201 739.422 176.662V273H698.59ZM887.373 273V46.51H928.205V179.533L998.066 102.654H1048.47L981.797 173.472L1050.7 273H1004.76L955.001 197.716L928.205 226.107V273H887.373ZM1074.29 273V102.654H1112.57L1114.16 149.866L1110.65 149.228C1113.21 132.853 1117.99 121.05 1125.01 113.819C1132.24 106.376 1142.02 102.654 1154.36 102.654H1169.99V137.744H1154.04C1145.32 137.744 1138.09 139.02 1132.35 141.572C1126.6 144.124 1122.24 148.165 1119.27 153.694C1116.5 159.011 1115.12 166.029 1115.12 174.748V273H1074.29ZM1209.46 320.85V289.269H1231.15C1236.68 289.269 1240.72 288.418 1243.27 286.717C1246.04 285.016 1248.17 282.145 1249.65 278.104L1254.44 266.301H1242.64L1181.71 102.654H1224.13L1266.88 228.021L1307.71 102.654H1350.14L1283.47 290.864C1279.64 301.497 1274.22 309.153 1267.2 313.832C1260.39 318.511 1250.82 320.85 1238.49 320.85H1209.46ZM1372.1 320.85V102.654H1411.34L1412.3 139.02L1408.15 137.106C1412.4 124.559 1419.32 115.095 1428.89 108.715C1438.67 102.122 1450.05 98.826 1463.02 98.826C1479.18 98.826 1492.58 102.867 1503.21 110.948C1514.06 119.029 1522.14 129.769 1527.46 143.167C1532.77 156.565 1535.43 171.452 1535.43 187.827C1535.43 204.202 1532.67 219.089 1527.14 232.487C1521.82 245.885 1513.74 256.625 1502.89 264.706C1492.26 272.787 1478.86 276.828 1462.7 276.828C1454.19 276.828 1446.22 275.339 1438.77 272.362C1431.54 269.385 1425.27 265.131 1419.95 259.602C1414.85 254.073 1411.23 247.586 1409.11 240.143L1412.94 236.953V320.85H1372.1ZM1453.13 243.652C1465.46 243.652 1475.14 238.761 1482.16 228.978C1489.39 218.983 1493 205.266 1493 187.827C1493 170.388 1489.39 156.778 1482.16 146.995C1475.14 137 1465.46 132.002 1453.13 132.002C1444.84 132.002 1437.71 134.129 1431.76 138.382C1425.8 142.423 1421.12 148.59 1417.72 156.884C1414.53 165.178 1412.94 175.492 1412.94 187.827C1412.94 200.162 1414.53 210.476 1417.72 218.77C1420.91 227.064 1425.48 233.338 1431.44 237.591C1437.6 241.632 1444.84 243.652 1453.13 243.652ZM1629.46 273C1612.45 273 1599.9 269.066 1591.82 261.197C1583.95 253.328 1580.02 240.994 1580.02 224.193V62.779H1620.85V220.365C1620.85 228.234 1622.55 233.763 1625.96 236.953C1629.36 239.93 1634.67 241.419 1641.91 241.419H1665.83V273H1629.46ZM1553.22 134.235V102.654H1665.83V134.235H1553.22ZM1695.78 273V102.654H1736.61V273H1695.78ZM1695.14 80.005V43.639H1737.57V80.005H1695.14ZM1789.65 273V95.955C1789.65 80.643 1793.91 68.6273 1802.41 59.908C1811.13 50.976 1824.42 46.51 1842.29 46.51H1875.46V78.091H1849.94C1843.35 78.091 1838.46 79.7923 1835.27 83.195C1832.29 86.5977 1830.8 91.5953 1830.8 98.188V273H1789.65ZM1765.41 138.701V107.12H1873.23V138.701H1765.41ZM1920.67 320.85V289.269H1942.36C1947.89 289.269 1951.93 288.418 1954.48 286.717C1957.25 285.016 1959.37 282.145 1960.86 278.104L1965.65 266.301H1953.84L1892.92 102.654H1935.34L1978.09 228.021L2018.92 102.654H2061.35L1994.68 290.864C1990.85 301.497 1985.43 309.153 1978.41 313.832C1971.6 318.511 1962.03 320.85 1949.7 320.85H1920.67Z" fill="#EDEDED"/></svg></div>
    <div class="center">
        <div class="content">
            <div class="icon"><svg viewBox="0 0 64 64" width="64" height="64"><circle class="ring" cx="32" cy="32" r="30"/><polyline class="check" points="21,34 29,42 43,25"/></svg></div>
            <div>
                <h1>You're all set</h1>
                <p class="desc" style="margin-top:6px">Signed in to Enkryptify. Head back to your terminal.</p>
            </div>
            <p class="hint">This tab will close automatically.</p>
        </div>
    </div>
</div>
<script>setTimeout(function(){window.close()},3000)</script>
</body>
</html>`;
        return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
    }
    private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthResponse> {
        const payload = {
            grant_type: "authorization_code",
            client_id: this.CLIENT_ID,
            code,
            redirect_uri: this.REDIRECT_URL,
            code_verifier: codeVerifier,
        };

        const res = await http.post<AuthResponse>("/v1/auth/token", payload, {
            validateStatus: () => true,
        });

        if (res.status < 200 || res.status >= 300) {
            throw new CLIError(
                "Could not complete the login.",
                `The server rejected the authentication request (status ${res.status}).`,
                'Run "ek login" to try again. If this persists, check your network connection.',
            );
        }

        const data = res.data as AuthResponse;
        if (!data.accessToken) {
            throw new CLIError(
                "Could not complete the login.",
                "The server response was incomplete. No access token was provided.",
                'Run "ek login" to try again.',
            );
        }

        return data;
    }

    private async markAuthenticated(accessToken: string, user: UserInfo): Promise<void> {
        await keyring.set(
            this.KEYRING_KEY,
            JSON.stringify({
                accessToken,
                userId: user.id,
                email: user.email,
            }),
        );

        await configManager.markAuthenticated();
    }

    async getUserInfo(token: string): Promise<UserInfo | null> {
        const res = await http.get<UserInfo | string>("/v1/me", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            validateStatus: () => true,
        });

        if (res.status === 401 || res.status === 403) {
            return null;
        }

        if (res.status < 200 || res.status >= 300) {
            throw new CLIError(
                "Could not retrieve your account information.",
                `The server returned an unexpected response (status ${res.status}).`,
                'Run "ek login" to try again.',
            );
        }

        return res.data as UserInfo;
    }

    async getCredentials(): Promise<Credentials> {
        const authDataString = await keyring.get(this.KEYRING_KEY);
        if (!authDataString) {
            throw CLIError.from("AUTH_NOT_LOGGED_IN");
        }

        try {
            const authData = JSON.parse(authDataString) as StoredAuthData;
            if (!authData || !authData.accessToken) {
                throw CLIError.from("AUTH_NOT_LOGGED_IN");
            }
            return { accessToken: authData.accessToken };
        } catch (error: unknown) {
            if (error instanceof CLIError) throw error;
            logger.debug(error instanceof Error ? error.message : String(error));
            throw CLIError.from("AUTH_NOT_LOGGED_IN");
        }
    }
}
