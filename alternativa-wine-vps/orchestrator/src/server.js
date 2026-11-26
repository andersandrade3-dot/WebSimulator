import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { SessionManager, HttpError } from './sessions.js';
import { makeSupabaseEnder } from './supabase.js';

export function tokenOk(header, expected) {
  const given = Buffer.from((header ?? '').replace(/^Bearer /i, ''));
  const want = Buffer.from(expected);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

async function readJson(req, limit = 4096) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Corpo muito grande');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

export function createServer(cfg, manager) {
  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true });
      if (!tokenOk(req.headers.authorization, cfg.apiToken)) return send(401, { error: 'Não autorizado' });

      const m = url.pathname.match(/^\/sessions(?:\/([^/]+)(?:\/(token|heartbeat))?)?$/);
      if (!m) return send(404, { error: 'Rota inexistente' });
      const [, id, action] = m;

      if (!id && req.method === 'GET') {
        const list = await manager.list();
        return send(200, { sessions: list.map((c) => ({ sessionId: c.Labels['intelsim.session'], state: c.State, user: c.Labels['intelsim.user'] })) });
      }
      if (!id && req.method === 'POST') {
        const b = await readJson(req);
        return send(200, await manager.start({ sessionId: b.sessionId, userId: b.userId, expiresAtMs: Date.parse(b.expiresAt) }));
      }
      if (id && action === 'token' && req.method === 'POST') return send(200, await manager.token(id));
      if (id && action === 'heartbeat' && req.method === 'POST') return send(200, await manager.heartbeat(id));
      if (id && !action && req.method === 'DELETE') {
        const b = await readJson(req).catch(() => ({}));
        const reason = ['user', 'restart', 'admin'].includes(b.reason) ? b.reason : 'user';
        return send(200, await manager.end(id, reason));
      }
      return send(405, { error: 'Método não permitido' });
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      console.error('[orchestrator] erro:', e);
      return send(500, { error: 'Erro interno' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const manager = new SessionManager(cfg, { onEnded: makeSupabaseEnder(cfg) });
  createServer(cfg, manager).listen(cfg.port, () => console.log(`[orchestrator] ouvindo na porta ${cfg.port}`));
  setInterval(() => manager.reap().then((r) => r.length && console.log('[reaper] encerradas:', r)).catch((e) => console.error('[reaper]', e.message)), 30_000);
}
