import type { AuthProvider, LoginOptions, Credentials } from '../base/AuthProvider.js';
import { keyring } from '../../lib/keyring.js';
import { createHash, randomBytes } from 'crypto';
import { URL } from 'url';
import open from 'open';
import { config as configManager } from '../../lib/config.js';

const CLIENT_ID = 'enkryptify-cli';
const AUTH_BASE_URL = 'https://app.enkryptify.com';
const TOKEN_ENDPOINT = 'https://api.enkryptify.com/v1/auth/token';
const USER_INFO_ENDPOINT = 'https://api.enkryptify.com/v1/me';
const REDIRECT_URL = 'http://localhost:51823/callback';
const CALLBACK_PORT = 51823;
const DEFAULT_SCOPES = 'openid profile email secrets:read secrets:write';
const ENV_TOKEN_KEY = 'ENKRYPTIFY_TOKEN';

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

function base64Url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+/g, '');
}
const ENK_PROVIDER = "enkryptify";


export class EnkryptifyAuth implements AuthProvider {
  async login(options?: LoginOptions): Promise<void> {

    let envToken: string | undefined;
    

    try {
      const creds = await this.getCredentials();
      envToken = creds.accessToken;
    } catch (error) {
      console.warn('No credentials found, continuing with login flow...');
      envToken = undefined;  
    }
        
    if(envToken){
      if(options?.force)
        {
          console.log('Force flag is set, deleting environment token...');
          delete process.env[ENV_TOKEN_KEY];
        }else{
          const isAuth = await this.getUserInfo(envToken).catch(() => false);
          if(isAuth){
            console.log('Already authenticated. Use --force to re-authenticate.');
        
            const provider = await configManager.getProvider('enkryptify');
            const nowSec = Math.floor(Date.now() / 1000);
    
            if (provider) {
              await configManager.overrideProvider('enkryptify', {
                ...provider.settings,
                authenticated: true,
                last_login: nowSec,
              });
            } else {
              await configManager.createProvider('enkryptify', {
                authenticated: true,
                last_login: nowSec,
              });
            }
            return;
    
          }else{
            console.warn(`${ENV_TOKEN_KEY} is set but token is invalid, continuing with login flow...`);
            delete process.env[ENV_TOKEN_KEY];
    
          }

        }
    }

      

    const codeVerifier = base64Url(randomBytes(32));
    const codeChallenge = base64Url(
      createHash('sha256').update(codeVerifier).digest(),
    );
    const state = base64Url(randomBytes(32));



    const authResponse = await this.runPkceFlow({
      codeVerifier,
      codeChallenge,
      state,
      signal: (options as any)?.signal,
    });

    const userInfo = await this.getUserInfo(authResponse.accessToken);
    if (!userInfo) {
      throw new Error('Failed to fetch user info after authentication');
    }

    await this.markAuthenticated(authResponse.accessToken, userInfo);

  }

  private async runPkceFlow(params: {
    codeVerifier: string;
    codeChallenge: string;
    state: string;
    signal?: AbortSignal;
  }): Promise<AuthResponse> {
    const { codeVerifier, codeChallenge, state, signal } = params;

    return new Promise<AuthResponse>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Login cancelled by user'));
        return;
      }

      const abortHandler = () => {
        fail(new Error('Login cancelled by user'));
      };
      signal?.addEventListener('abort', abortHandler);
      let server: ReturnType<typeof Bun.serve> | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        server?.stop();
        if (timeoutId) clearTimeout(timeoutId); 
        server = null;
        timeoutId = null;
      };

      const finish = (result: AuthResponse) => {
        cleanup();
        resolve(result);
      };

      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };

      const handleCallback = async (req: Request): Promise<Response> => {
        try {
          const url = new URL(req.url);
          const error = url.searchParams.get('error');
          const errorDesc = url.searchParams.get('error_description') || error || "";

          if (error) {
            setTimeout(() => {
              fail(new Error(`authentication error: ${errorDesc}`));
            }, 1000);
            return this.errorResponse(errorDesc);
          }

          if (url.searchParams.get('state') !== state) {
            setTimeout(() => {
              fail(new Error('invalid state parameter'));
            }, 1000);
            return this.errorResponse('Invalid state parameter');
          }

          const code = url.searchParams.get('code');
          if (!code) {
            setTimeout(() => {
              fail(new Error('missing authorization code'));
            }, 1000);
            return this.errorResponse('Missing authorization code');
          }

          const authResp = await this.exchangeCodeForToken(code, codeVerifier);
          
          setTimeout(() => {
            finish(authResp);
          }, 1000);

          return this.successResponse();
        } catch (err: any) {
          setTimeout(() => {
            fail(err);
          }, 1000);
          return new Response('Internal error', { status: 500 });
        }
      };

      server = Bun.serve({
        port: CALLBACK_PORT,
        routes: { '/callback': handleCallback },
        fetch: () => new Response('Not Found', { status: 404 }),
      });

      const authUrl = this.buildAuthUrl(codeChallenge, state);
      this.logAuthInstructions(authUrl);

      open(authUrl).catch(err => {
        console.warn('\n  Failed to open browser. Please open this URL manually:');
        console.warn(authUrl);
        console.warn(String(err));
      });

      timeoutId = setTimeout(() => {
        fail(new Error('authentication timeout'));
      }, 5 * 60 * 1000);
    });
  }

  private errorResponse(message: string): Response {
    return new Response(
      `<html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
          <h2 style="color: #E64545;">Authentication Error</h2>
          <p style="color: #F7F7F7;">${message}</p>
          <p style="color: #F7F7F7;">You can close this window and try again.</p>
        </body>
      </html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } },
    );
  }

  private successResponse(): Response {
    return new Response(
      `<html>
        <head><title>Authentication Successful</title></head>
        <body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
          <h2 style="color: #2AC769;">Authentication Successful!</h2>
          <p style="color: #F7F7F7;">You have successfully authenticated with Enkryptify.</p>
          <p style="color: #F7F7F7;">You can now close this window and return to your terminal.</p>
        </body>
      </html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );
  }

  private buildAuthUrl(codeChallenge: string, state: string): string {
    const authUrl = new URL('/oauth/authorize', AUTH_BASE_URL);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URL);
    authUrl.searchParams.set('scope', DEFAULT_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

  
    return authUrl.toString();
  }

  private logAuthInstructions(authUrl: string): void {
    console.log('\n🌐 Opening browser for authentication...');
    console.log(`\n   📋 AUTHENTICATION URL:`);
    console.log(`   ${authUrl}\n`);
  }

  private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthResponse> {
    const payload = {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URL,
      code_verifier: codeVerifier,
    };

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`token exchange failed with status ${res.status}: ${text}`);
    }

    const data = (await res.json()) as AuthResponse;
    if (!data.accessToken) {
      throw new Error('token exchange response missing accessToken');
    }

    return data;
  }

  private async markAuthenticated(accessToken: string, user: UserInfo): Promise<void> {
    await keyring.set(ENK_PROVIDER, {
      accessToken,
      userId: user.id,
      email: user.email,
    });

    const provider = await configManager.getProvider(ENK_PROVIDER);
    const nowSec = Math.floor(Date.now() / 1000);

    if (provider) {
      await configManager.overrideProvider(ENK_PROVIDER, {
        ...provider.settings,
        authenticated: true,
        last_login: nowSec,
      });
    } else {
      await configManager.createProvider(ENK_PROVIDER, {
        authenticated: true,
        last_login: nowSec,
      });
    }
  }



  async getUserInfo(token: string): Promise<UserInfo | null> {
    const res = await fetch(USER_INFO_ENDPOINT, {
      method: 'GET',
      headers: {
        'X-API-Key': token,
        Accept: 'application/json',
      },
    });

    if (res.status === 401 || res.status === 403) {
      return null;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`failed to get user info, status: ${res.status}, body: ${text}`);
    }

    return (await res.json()) as UserInfo;
  }

 

  async logout(): Promise<void> {
    await keyring.delete(ENK_PROVIDER);

    const provider = await configManager.getProvider(ENK_PROVIDER);
    if (provider) {
      await configManager.overrideProvider(ENK_PROVIDER, {
        ...provider.settings,
        authenticated: false,
      });
    }
  }

  async getCredentials(): Promise<Credentials> {
    const envToken = process.env[ENV_TOKEN_KEY];
    if (envToken) {
      return { accessToken: envToken };
    }

    const authData = await keyring.get(ENK_PROVIDER);
    if (!authData || !authData.accessToken) {
      throw new Error('Not authenticated. Please run "ek login enkryptify" first.');
    }

    return { accessToken: authData.accessToken };
  }

 
}
