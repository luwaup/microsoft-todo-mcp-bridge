/** The Microsoft identity platform is always the upstream OAuth provider. */
const MS = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPES = 'offline_access User.Read Tasks.ReadWrite';

export type TokenResult = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
export const base64url = (bytes: ArrayBuffer): string => {
  let binary = '';
  for (const v of new Uint8Array(bytes)) binary += String.fromCharCode(v);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
export async function challenge(verifier: string): Promise<string> {
  return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}
export function authorizationUrl(clientId:string, redirectUri:string, state:string, codeChallenge:string):string {
  const url=new URL(`${MS}/authorize`);
  for(const [key,value] of Object.entries({client_id:clientId,response_type:'code',redirect_uri:redirectUri,scope:SCOPES,state,code_challenge:codeChallenge,code_challenge_method:'S256',prompt:'select_account'})) url.searchParams.set(key,value);
  return url.toString();
}
async function postToken(params: Record<string,string>, clientId:string, clientSecret:string, fetcher:typeof fetch=fetch):Promise<TokenResult> {
  const res=await fetcher(`${MS}/token`,{
    method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    signal:AbortSignal.timeout(15000),
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,...params}).toString()
  });
  if(!res.ok) {
    // Do not echo token endpoint's response; it can include sensitive OAuth context.
    throw new MicrosoftTokenError(res.status);
  }
  const result=await res.json() as TokenResult;
  if(typeof result.access_token!=='string' || !result.access_token || !Number.isFinite(result.expires_in) || result.expires_in<180 || (result.refresh_token!==undefined && (typeof result.refresh_token!=='string' || !result.refresh_token))) throw new Error('Incomplete Microsoft token response');
  return result;
}
export class MicrosoftTokenError extends Error {
  constructor(public readonly status:number) {super(`Microsoft identity platform rejected token request (HTTP ${status})`);}
}
export const exchangeCode=(code:string,verifier:string,redirectUri:string,id:string,secret:string,fetcher?:typeof fetch)=>
  postToken({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirectUri},id,secret,fetcher);
export const refreshMicrosoft=(refreshToken:string,id:string,secret:string,fetcher?:typeof fetch)=>
  postToken({grant_type:'refresh_token',refresh_token:refreshToken,scope:SCOPES},id,secret,fetcher);
export async function getMicrosoftUserId(token:string,fetcher:typeof fetch=fetch):Promise<string> {
  const res=await fetcher('https://graph.microsoft.com/v1.0/me',{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!res.ok) throw new Error('Unable to verify Microsoft user identity');
  const data=await res.json() as {id?:string};
  if(typeof data.id!=='string' || !data.id.trim()) throw new Error('Microsoft user has no stable ID');
  return data.id;
}
