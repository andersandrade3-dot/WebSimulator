import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signAndEncrypt, decryptAndVerify, buildPayload, clientId, requestAuthToken } from '../src/guac.js';
import { decideReap, SessionManager, UUID_RE } from '../src/sessions.js';
import { loadConfig } from '../src/config.js';
import { tokenOk } from '../src/server.js';

const KEY = crypto.randomBytes(16).toString('hex');
const uid = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';

test('payload do Guacamole: cifra/assinatura são reversíveis e à prova de adulteração', () => {
  const p = buildPayload({ userId: uid, containerName: `sim-${sid}`, vncPassword: 'abc', expiresAtMs: Date.now() + 1000 });
  const enc = signAndEncrypt(p, KEY);
  assert.deepEqual(decryptAndVerify(enc, KEY), p);
  assert.throws(() => decryptAndVerify(enc, crypto.randomBytes(16).toString('hex')));
  // adulterar um byte do ciphertext deve falhar (padding ou HMAC)
  const raw = Buffer.from(enc, 'base64');
  raw[raw.length - 20] ^= 1;
  assert.throws(() => decryptAndVerify(raw.toString('base64'), KEY));
});

test('payload contém UMA conexão VNC apontando só para o container da sessão', () => {
  const p = buildPayload({ userId: uid, containerName: `sim-${sid}`, vncPassword: 'x', expiresAtMs: 1 });
  assert.equal(Object.keys(p.connections).length, 1);
  assert.equal(p.connections.sim.parameters.hostname, `sim-${sid}`);
  assert.equal(p.connections.sim.protocol, 'vnc');
});

test('clientId segue o formato base64("sim\\0c\\0json")', () => {
  assert.equal(Buffer.from(clientId(), 'base64').toString(), 'sim\0c\0json');
});

test('requestAuthToken envia data= e devolve o authToken', async () => {
  let seen;
  const fake = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ authToken: 'T123' }) };
  };
  const t = await requestAuthToken('http://g:8080', { username: 'u', expires: 1, connections: {} }, KEY, fake);
  assert.equal(t, 'T123');
  assert.equal(seen.url, 'http://g:8080/api/tokens');
  assert.match(seen.init.body, /^data=/);
});

test('reaper: decide encerrar expirada, inativa e finalizada', () => {
  const base = { state: 'running', expiresAtMs: 10_000, lastBeatMs: 9_000, nowMs: 9_500, idleMs: 1_000 };
  assert.equal(decideReap(base), null);
  assert.equal(decideReap({ ...base, nowMs: 10_000 }), 'expired');
  assert.equal(decideReap({ ...base, nowMs: 9_999, lastBeatMs: 8_000 }), 'inactive');
  assert.equal(decideReap({ ...base, state: 'exited' }), 'app_closed');
});

test('SessionManager.start rejeita IDs maliciosos e respeita o teto de sessões', async () => {
  const cfg = loadConfig({
    ORCH_API_TOKEN: 'a'.repeat(40), SIM_HOST_PATH: '/srv/simulador', GUAC_JSON_SECRET: KEY, MAX_SESSIONS: '1',
  });
  const created = [];
  const docker = {
    listContainers: async () => [{ State: 'running', Labels: { 'intelsim.session': 'x' } }],
    getContainer: () => ({ inspect: async () => { const e = new Error('nf'); e.statusCode = 404; throw e; } }),
    createContainer: async (o) => { created.push(o); },
  };
  const m = new SessionManager(cfg, { docker });
  await assert.rejects(m.start({ sessionId: '../etc', userId: uid, expiresAtMs: Date.now() + 5000 }), /IDs inválidos/);
  await assert.rejects(m.start({ sessionId: sid, userId: uid, expiresAtMs: Date.now() + 5000 }), /Capacidade/);
  assert.equal(created.length, 0);
});

test('SessionManager.start cria container endurecido (sem caps, sem privilégios, rede interna, original ro)', async () => {
  const cfg = loadConfig({ ORCH_API_TOKEN: 'a'.repeat(40), SIM_HOST_PATH: '/srv/simulador', GUAC_JSON_SECRET: KEY });
  let spec;
  const docker = {
    listContainers: async () => [],
    getContainer: () => ({ inspect: async () => { const e = new Error('nf'); e.statusCode = 404; throw e; }, remove: async () => {} }),
    createContainer: async (o) => { spec = o; return { start: async () => { throw new Error('stop-here'); } }; },
  };
  const m = new SessionManager(cfg, { docker });
  await assert.rejects(m.start({ sessionId: sid, userId: uid, expiresAtMs: Date.now() + 60_000 }));
  assert.deepEqual(spec.HostConfig.CapDrop, ['ALL']);
  assert.equal(spec.HostConfig.Privileged, false);
  assert.equal(spec.HostConfig.NetworkMode, 'sessions_net');
  assert.ok(spec.HostConfig.Binds[0].endsWith(':/opt/simulador-src:ro'));
  assert.ok(spec.HostConfig.Memory > 0 && spec.HostConfig.PidsLimit > 0);
});

test('autenticação do orquestrador compara token em tempo constante', () => {
  assert.equal(tokenOk('Bearer abc', 'abc'), true);
  assert.equal(tokenOk('Bearer abd', 'abc'), false);
  assert.equal(tokenOk(undefined, 'abc'), false);
});

test('UUID_RE', () => {
  assert.ok(UUID_RE.test(sid));
  assert.ok(!UUID_RE.test('x; rm -rf /'));
});
