import { handleApiRequest, getUserFromSession, REMEMBER_IDLE_MS, SHORT_SESSION_MS } from '../server/routes/api-handler.ts';
import { hashRecoveryCode } from '../server/auth/recovery.ts';
import { D1DatabaseLike } from '../server/db/types.ts';
import { handleBootstrapRequest } from './bootstrap.ts';
import { handleAmbassadorRequest } from '../server/routes/ambassadors.ts';
import { notificationApi, scheduledNotificationJobs, deliverPendingPush } from '../server/notifications/notification-core.ts';
import type { PushSecrets } from '../server/notifications/web-push.ts';

export interface Env extends PushSecrets {
  DB: D1DatabaseLike;
  BOSS_BOOTSTRAP_SECRET?: string;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env, context?: {waitUntil(promise: Promise<unknown>): void}): Promise<Response> {
    const url = new URL(request.url);

    // API Route routing
    if (url.pathname.startsWith('/api/')) {
      const cookieHeader = request.headers.get('Cookie') || '';
      const authHeader = request.headers.get('Authorization') || '';
      const tokenMatch = cookieHeader.match(/boss_session=([^;]+)/);
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = (bearerMatch ? bearerMatch[1] : undefined) || (tokenMatch ? tokenMatch[1] : undefined);
      const ambassadorToken = cookieHeader.match(/(?:^|;\s*)boss_ambassador_session=([^;]+)/)?.[1];

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

      // Cookie auth is same-origin only for state-changing requests.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin) {
          return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
        }
      }

      let apiRes: { status: number; data?: unknown; headers?: Record<string, string>; binary?: Uint8Array };
      try {
        // Public, one-time bootstrap routes must run before the authenticated
        // router, which queries the sessions table.
        if (url.pathname.startsWith('/api/bootstrap/')) {
          apiRes = await handleBootstrapRequest(request.method, url.pathname, body, env);
        } else if (url.pathname.startsWith('/api/ambassadors/notifications/')) {
          apiRes = await notificationApi(request.method,url.pathname,body,{token,ambassadorToken},env.DB,env);
        } else if (url.pathname.startsWith('/api/ambassadors/')) {
          apiRes = await handleAmbassadorRequest(request.method, url.pathname, body, { token, ambassadorToken, ip: clientIp, query }, env.DB);
        } else {
          // When migrations have not been applied, explain the real problem
          // instead of returning an opaque 500 from the login handler.
          apiRes = await handleApiRequest(
            request.method,
            url.pathname,
            query,
            body,
            { token, ip: clientIp },
            env.DB
          );
        }
      } catch (error) {
        console.error('[Boss API] Unhandled request error', {
          path: url.pathname,
          error: error instanceof Error ? error.message : 'unknown',
        });
        const message = error instanceof Error ? error.message : '';
        apiRes = /no such table|has no column|database not initialized/i.test(message)
          ? { status: 503, data: { error: 'Database tables are not initialized. Apply D1 migrations to boss-production-db.' } }
          : { status: 500, data: { error: 'Server error. Contact the administrator; details are in Cloudflare Workers logs.' } };
      }

      // Refresh remembered-device expiration ONLY for genuine user activity.
      // Passive GET/refresh requests never extend the 20-day inactivity period.
      const activity = request.method.toUpperCase() === 'POST' || request.method.toUpperCase() === 'PUT' || request.method.toUpperCase() === 'DELETE';
      if (activity && token && apiRes.status < 400 && !['/api/auth/login','/api/auth/logout','/api/auth/logout-all', '/api/auth/recovery/reset'].includes(url.pathname)) {
        const activeUser = await getUserFromSession(env.DB, token);
        if (activeUser) {
          const hash = await hashRecoveryCode(token);
          const session = await env.DB.prepare('SELECT remember_device FROM sessions WHERE id = ? OR id = ?').bind(hash, token).first<{remember_device:number}>();
          if (session) {
            const idleDuration = Number(session.remember_device) === 1 ? REMEMBER_IDLE_MS : SHORT_SESSION_MS;
            const now = Date.now();
            await env.DB.prepare('UPDATE sessions SET last_activity_at = ?, expires_at = ? WHERE id = ? OR id = ?')
              .bind(now, now + idleDuration, hash, token).run();
            apiRes.headers = { ...(apiRes.headers || {}), 'Set-Cookie': `boss_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${Math.floor(idleDuration / 1000)}` };
          }
        }
      }

      if (apiRes.status < 400 && request.method === 'POST' && (['/api/ambassadors/admin/campaigns','/api/ambassadors/admin/reviews','/api/ambassadors/submit'].includes(url.pathname) || /^\/api\/ambassadors\/notifications\/(manager|member)\/test$/.test(url.pathname)) && context) {
        context.waitUntil(deliverPendingPush(env.DB,env,24).catch(err=>console.warn('[AGN push]',err instanceof Error?err.message:'unknown')));
      }
      const headers = new Headers(apiRes.headers || {});
      if (url.pathname.startsWith('/api/ambassadors/')) headers.set('Cache-Control', 'no-store');
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
  async scheduled(_event: unknown, env: Env, context: {waitUntil(promise:Promise<unknown>):void}):Promise<void> {
    context.waitUntil((async()=>{
      await scheduledNotificationJobs(env.DB,Date.now());
      await deliverPendingPush(env.DB,env,80);
    })());
  },
};
