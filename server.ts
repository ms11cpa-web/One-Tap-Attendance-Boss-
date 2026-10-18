import express from 'express';
import http from 'node:http';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOrCreateNodeD1Database } from './src/server/db/node-d1.ts';
import { handleApiRequest, getUserFromSession, REMEMBER_IDLE_MS, SHORT_SESSION_MS } from './src/server/routes/api-handler.ts';
import { hashRecoveryCode } from './src/server/auth/recovery.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());
  app.use(cookieParser());

  // Initialize SQLite (Cloudflare D1 Emulation for local / AI Studio runtime)
  console.log('[Boss] Initializing database...');
  const db = await getOrCreateNodeD1Database();
  console.log('[Boss] Database ready.');

  // API Route Handler
  app.all('/api/*', async (req, res) => {
    try {
      const token = req.cookies?.boss_session || (req.headers.authorization?.replace(/^Bearer\s+/, ''));
      const query = req.query as Record<string, string>;
      const body = req.body || {};
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      const result = await handleApiRequest(
        req.method,
        req.path,
        query,
        body,
        { token, ip },
        db
      );

      const activeMethod = ['POST', 'PUT', 'DELETE'].includes(req.method.toUpperCase());
      if (activeMethod && token && result.status < 400 && !['/api/auth/login','/api/auth/logout','/api/auth/logout-all','/api/auth/recovery/reset'].includes(req.path)) {
        const sessionUser = await getUserFromSession(db, token);
        if (sessionUser) {
          const hash = await hashRecoveryCode(token);
          const sr = await db.prepare('SELECT remember_device FROM sessions WHERE id = ? OR id = ?').bind(hash, token).first<{remember_device:number}>();
          if (sr) {
            const lifetime = Number(sr.remember_device) === 1 ? REMEMBER_IDLE_MS : SHORT_SESSION_MS;
            const now = Date.now();
            await db.prepare('UPDATE sessions SET last_activity_at = ?, expires_at = ? WHERE id = ? OR id = ?').bind(now, now + lifetime, hash, token).run();
            result.headers = { ...(result.headers || {}), 'Set-Cookie': `boss_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(lifetime / 1000)}` };
          }
        }
      }
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
      }

      if (result.binary) {
        return res.status(result.status).send(Buffer.from(result.binary));
      }

      return res.status(result.status).json(result.data);
    } catch (err: unknown) {
      console.error('[Boss] API Handler Uncaught Error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  if (!isProd) {
    // Vite Dev Server middleware mode with HTTP Server attached for HMR WebSockets
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Handle client errors and socket cleanups gracefully
  server.on('clientError', (err: any, socket) => {
    if (err.code === 'ECONNRESET' || !socket.writable) {
      return;
    }
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Boss] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Boss] Fatal startup failure:', err);
  process.exit(1);
});
