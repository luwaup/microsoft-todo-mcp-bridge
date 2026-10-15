import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
export interface Env {
  OAUTH_KV: KVNamespace;
  PUBLIC_BASE_URL?: string;
  MS_CLIENT_ID: string;
  MS_CLIENT_SECRET: string;
  OAUTH_PROVIDER?: OAuthHelpers;
}
export type Props = { accessToken:string; msRefreshToken:string; userId:string; expiresAt:number; grantedScopes:string[] };
