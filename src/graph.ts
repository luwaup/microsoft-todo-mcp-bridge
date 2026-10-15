/** A constrained Microsoft Graph To Do client; never fetch arbitrary supplied URLs. */
export type Fetcher = typeof fetch;
const ROOT = 'https://graph.microsoft.com/v1.0';
const BASE_PATH = '/me/todo/';
const MAX_PAGES = 20;

export class GraphError extends Error {
  constructor(public readonly status: number, message: string, public readonly retryAfter?: number) {
    super(message);
    this.name = 'GraphError';
  }
}
export const pathSegment = (id: string) => {
  if (!id || id === '.' || id === '..' || id.length > 1024 || /[\x00-\x1f\x7f]/.test(id)) throw new Error('Invalid resource ID');
  return encodeURIComponent(id);
};
export const listPath = (id: string) => `/me/todo/lists/${pathSegment(id)}`;
export const tasksPath = (id: string) => `${listPath(id)}/tasks`;
export const taskPath = (listId: string, taskId: string) => `${tasksPath(listId)}/${pathSegment(taskId)}`;
export const checklistPath = (listId: string, taskId: string) => `${taskPath(listId, taskId)}/checklistItems`;
export const taskDate = (date: string, timezone = 'UTC') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) {
    throw new Error('Expected calendar date YYYY-MM-DD');
  }
  return { dateTime: `${date}T00:00:00`, timeZone: timezone };
};

export type CollectionResult<T> = { items: T[]; truncated: boolean };

export class GraphTodo {
  private readonly token: string;
  private readonly fetcher: Fetcher;
  constructor(token: string, fetcher: Fetcher = fetch) {
    if (!token) throw new Error('Missing delegated token');
    this.token = token;
    this.fetcher = fetcher.bind(globalThis);
  }
  async request<T>(method: 'GET'|'POST'|'PATCH'|'DELETE', path: string, payload?: unknown, extraHeaders?: Record<string,string>): Promise<T> {
    if (!path.startsWith(BASE_PATH)) throw new Error('Out-of-scope Graph path');
    const url = new URL(ROOT + path);
    if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0' + BASE_PATH)) {
      throw new Error('Unsafe Graph request target');
    }
    const headers:Record<string,string> = { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...(payload===undefined ? {} : {'Content-Type': 'application/json'}) };
    for (const [name,value] of Object.entries(extraHeaders || {})) {
      if (name.toLowerCase() !== 'if-match') throw new Error('Unsupported Graph header');
      headers['If-Match'] = value;
    }
    // Never automatically retry writes: Graph may have committed a timed-out create.
    const res = await this.fetcher(url.href, {
      method, redirect: 'manual',
      headers, signal: AbortSignal.timeout(15000),
      body: payload===undefined ? undefined : JSON.stringify(payload),
    });
    if (!res.ok) {
      // Do not leak the upstream body, which could contain identifiers or content.
      const raw = res.headers.get('Retry-After');
      const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw)-Date.now())/1000) : undefined;
      const retryAfter = seconds !== undefined && Number.isFinite(seconds) ? Math.max(0,seconds) : undefined;
      throw new GraphError(res.status, res.status === 412 ? 'Task changed since it was read; read it again before applying changes.' : `Microsoft Graph returned HTTP ${res.status}; check account permissions, item IDs or rate limits.${retryAfter === undefined ? '' : ` Retry after ${retryAfter} seconds.`}`,retryAfter);
    }
    if (res.status === 204) return { deleted: true } as T;
    return await res.json() as T;
  }
  async all<T>(path: string, maxItems=500): Promise<T[]> {
    return (await this.collect<T>(path,maxItems)).items;
  }
  async collect<T>(path: string, maxItems=500): Promise<CollectionResult<T>> {
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 1000) throw new Error('Invalid maxItems');
    const output:T[]=[];
    let next:string|undefined=path;
    let pages=0;
    let truncated=false;
    const initialUrl=new URL(ROOT+path);
    while(next && output.length < maxItems && pages++ < MAX_PAGES) {
      const page: { value:T[]; '@odata.nextLink'?: string } = await this.request('GET',next);
      if (!Array.isArray(page.value)) throw new Error('Invalid Microsoft Graph response');
      const remaining=maxItems-output.length;
      output.push(...page.value.slice(0,remaining));
      truncated=page.value.length>remaining || Boolean(page['@odata.nextLink']);
      if (!page['@odata.nextLink']) { next=undefined; break; }
      const candidate = new URL(page['@odata.nextLink']);
      if (candidate.origin !== 'https://graph.microsoft.com' || candidate.username || candidate.password || candidate.hash || candidate.pathname !== initialUrl.pathname) {
        throw new Error('Unsafe Graph pagination link');
      }
      next = candidate.pathname.replace(/^\/v1\.0/, '') + candidate.search;
    }
    return {items:output,truncated};
  }
}
