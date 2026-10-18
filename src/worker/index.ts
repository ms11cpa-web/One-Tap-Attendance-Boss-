import { handleApiRequest } from '../server/routes/api-handler.ts';
import { D1DatabaseLike } from '../server/db/types.ts';

export interface Env {
  DB: D1DatabaseLike;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API Route routing
    if (url.pathname.startsWith('/api/')) {
      const cookieHeader = request.headers.get('Cookie') || '';
      const authHeader = request.headers.get('Authorization') || '';
      const tokenMatch = cookieHeader.match(/boss_session=([^;]+)/);
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = (bearerMatch ? bearerMatch[1] : undefined) || (tokenMatch ? tokenMatch[1] : undefined);

      const query: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        query[key] = val;
      });

      let body: Record<string, unknown> = {};
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
          body = await request.json();
        } catch {
          body = {};
        }
      }

      const clientIp =
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-forwarded-for') ||
        '127.0.0.1';

      const apiRes = await handleApiRequest(
        request.method,
        url.pathname,
        query,
        body,
        { token, ip: clientIp },
        env.DB
      );

      const headers = new Headers(apiRes.headers || {});
      if (!headers.has('Content-Type') && !apiRes.binary) {
        headers.set('Content-Type', 'application/json');
      }

      if (apiRes.binary) {
        return new Response(apiRes.binary as unknown as BodyInit, {
          status: apiRes.status,
          headers,
        });
      }

      return new Response(JSON.stringify(apiRes.data), {
        status: apiRes.status,
        headers,
      });
    }

    // Static Assets serving (Cloudflare Workers Assets or Pages)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
