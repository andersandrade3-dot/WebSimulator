import crypto from 'node:crypto';
import Docker from 'dockerode';
import { buildPayload, clientId, requestAuthToken } from './guac.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL = 'intelsim.session';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const containerName = (id) => `sim-${id}`;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Decisão pura do "faxineiro": devolve o motivo de encerramento ou null. */
export function decideReap({ state, expiresAtMs, lastBeatMs, nowMs, idleMs }) {
  if (state !== 'running' && state !== 'created') return 'app_closed';
  if (nowMs >= expiresAtMs) return 'expired';
  if (nowMs - lastBeatMs > idleMs) return 'inactive';
  return null;
}

export class SessionManager {
  constructor(cfg, { docker, onEnded, fetchImpl } = {}) {
    this.cfg = cfg;
    this.docker = docker ?? new Docker(cfg.docker);
    this.onEnded = onEnded ?? (async () => {});
    this.fetchImpl = fetchImpl ?? fetch;
    this.lastBeat = new Map(); // sessionId -> epoch ms
  }

  async list() {
    return this.docker.listContainers({ all: true, filters: { label: [LABEL] } });
  }

  async #inspect(sessionId) {
    try {
      return await this.docker.getContainer(containerName(sessionId)).inspect();
    } catch (e) {
      if (e.statusCode === 404) return null;
      throw e;
    }
  }

  async #issue(sessionId, info) {
    const env = Object.fromEntries((info.Config.Env ?? []).map((e) => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)]));
    const expiresAtMs = Number(info.Config.Labels['intelsim.expires']);
    const userId = info.Config.Labels['intelsim.user'];
    const payload = buildPayload({
      userId,
      containerName: containerName(sessionId),
      vncPassword: env.VNC_PASSWORD,
      expiresAtMs,
    });
    const authToken = await requestAuthToken(this.cfg.guacamoleUrl, payload, this.cfg.guacSecret, this.fetchImpl);
    return { authToken, clientId: clientId(), expiresAt: new Date(expiresAtMs).toISOString() };
  }

  async start({ sessionId, userId, expiresAtMs }) {
    if (!UUID_RE.test(sessionId) || !UUID_RE.test(userId)) throw new HttpError(400, 'IDs inválidos');
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) throw new HttpError(400, 'expiresAt inválido');

    const existing = await this.#inspect(sessionId);
    if (existing) return this.token(sessionId);

    const running = (await this.list()).filter((c) => c.State === 'running' || c.State === 'created').length;
    if (running >= this.cfg.maxSessions) throw new HttpError(429, 'Capacidade máxima do servidor atingida');

    const vncPassword = crypto.randomBytes(12).toString('base64url');
    const container = await this.docker.createContainer({
      name: containerName(sessionId),
      Image: this.cfg.image,
      Env: [`VNC_PASSWORD=${vncPassword}`, `ALLOW_IP=${this.cfg.guacdIp}`, `SCREEN=${this.cfg.screen}`],
      Labels: { [LABEL]: sessionId, 'intelsim.user': userId, 'intelsim.expires': String(expiresAtMs) },
      HostConfig: {
        Init: true,
        NetworkMode: this.cfg.network,
        Binds: [`${this.cfg.simHostPath}:/opt/simulador-src:ro`],
        Memory: this.cfg.memoryBytes,
        MemorySwap: this.cfg.memoryBytes,
        NanoCpus: this.cfg.nanoCpus,
        PidsLimit: 256,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
        Tmpfs: { '/tmp': 'rw,size=64m' },
        RestartPolicy: { Name: 'no' },
        Privileged: false,
      },
    });
    this.lastBeat.set(sessionId, Date.now());

    try {
      await container.start();
      await this.#waitHealthy(sessionId, 60_000);
      return await this.token(sessionId);
    } catch (e) {
      await this.end(sessionId, 'failed');
      throw e instanceof HttpError ? e : new HttpError(502, `Falha ao iniciar o ambiente: ${e.message}`);
    }
  }

  async #waitHealthy(sessionId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const info = await this.#inspect(sessionId);
      if (!info || !info.State.Running) throw new HttpError(502, 'O simulador encerrou durante a inicialização');
      if (info.State.Health?.Status === 'healthy') return;
      await sleep(1000);
    }
    throw new HttpError(504, 'Tempo esgotado aguardando o simulador abrir');
  }

  async token(sessionId) {
    if (!UUID_RE.test(sessionId)) throw new HttpError(400, 'ID inválido');
    const info = await this.#inspect(sessionId);
    if (!info || !info.State.Running) throw new HttpError(404, 'Sessão não encontrada');
    if (Date.now() >= Number(info.Config.Labels['intelsim.expires'])) throw new HttpError(410, 'Sessão expirada');
    this.lastBeat.set(sessionId, Date.now());
    return this.#issue(sessionId, info);
  }

  async heartbeat(sessionId) {
    const info = await this.#inspect(sessionId);
    if (!info || !info.State.Running) throw new HttpError(404, 'Sessão não encontrada');
    this.lastBeat.set(sessionId, Date.now());
    return { ok: true };
  }

  async end(sessionId, reason) {
    if (!UUID_RE.test(sessionId)) throw new HttpError(400, 'ID inválido');
    try {
      await this.docker.getContainer(containerName(sessionId)).remove({ force: true, v: true });
    } catch (e) {
      if (e.statusCode !== 404) throw e;
    }
    this.lastBeat.delete(sessionId);
    await this.onEnded(sessionId, reason);
    return { ok: true };
  }

  /** Varre containers: encerra expirados, inativos e finalizados. */
  async reap(nowMs = Date.now()) {
    const ended = [];
    for (const c of await this.list()) {
      const sessionId = c.Labels[LABEL];
      if (!UUID_RE.test(sessionId)) continue;
      if (!this.lastBeat.has(sessionId)) this.lastBeat.set(sessionId, nowMs); // após reinício do orquestrador
      const reason = decideReap({
        state: c.State,
        expiresAtMs: Number(c.Labels['intelsim.expires']),
        lastBeatMs: this.lastBeat.get(sessionId),
        nowMs,
        idleMs: this.cfg.idleMs,
      });
      if (reason) {
        try {
          await this.end(sessionId, reason);
          ended.push({ sessionId, reason });
        } catch (e) {
          console.error(`[reaper] falha ao encerrar ${sessionId}:`, e.message);
        }
      }
    }
    return ended;
  }
}
