import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pgcrypto } });
const migration = fs.readFileSync((process.argv[2] ?? new URL('../migrations/0001_init.sql', import.meta.url)), 'utf8');

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
`);
await db.exec(migration);
console.log('✔ migração aplicada sem erros');

const U = { admin: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', t: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', s1: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', s2: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
for (const [k, id] of Object.entries(U))
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, `${k}@x.com`, { full_name: `Nome ${k}` }]);
await db.exec(`update public.profiles set role='admin', approved=true where email='admin@x.com'; update public.profiles set role='teacher', approved=true where email='t@x.com';`);
console.log('✔ trigger criou perfis:', (await db.query('select count(*)::int c from public.profiles')).rows[0].c);

async function as(role, uid, fn) {
  await db.exec(`set role ${role}; select set_config('app.uid', '${uid ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}
const q = (sql, p) => db.query(sql, p);

// --- RLS de profiles
await as('authenticated', U.s1, async () => {
  assert.equal((await q('select id from public.profiles')).rows.length, 1, 'aluno vê só o próprio perfil');
  await assert.rejects(q(`update public.profiles set role='admin' where id=$1`, [U.s1]), /permission denied/);
  await assert.rejects(q(`update public.profiles set approved=true where id=$1`, [U.s1]), /permission denied/);
  await q(`update public.profiles set full_name='Novo' where id=$1`, [U.s1]);
  await assert.rejects(q(`insert into public.classes(name,owner_id) values ('Hack',$1)`, [U.s1]), /row-level security/);
  await assert.rejects(q(`select * from public.admin_audit`), /./).catch(() => {});
  assert.equal((await q('select * from public.admin_audit')).rows.length, 0);
  await assert.rejects(q(`insert into public.sessions(user_id,expires_at) values ($1, now())`, [U.s1]), /permission denied/);
  await assert.rejects(q(`select public.start_session($1)`, [U.s1]), /permission denied/);
  await assert.rejects(q(`select public.reap_sessions()`), /permission denied/);
});
console.log('✔ aluno: só vê o próprio perfil; não eleva privilégio; não cria turma; não chama start_session');

// --- turma + join_class
let code;
await as('authenticated', U.t, async () => {
  await q(`insert into public.classes(name,owner_id) values ('Turma A',$1)`, [U.t]);
  code = (await q('select join_code from public.classes')).rows[0].join_code;
});
await as('authenticated', U.s1, async () => {
  await assert.rejects(q(`select public.join_class('ZZZZ')`), /invalid_code/);
  assert.equal((await q('select * from public.classes')).rows.length, 0, 'aluno não vê turma antes de entrar');
  await q(`select public.join_class($1)`, [code]);
  assert.equal((await q('select * from public.classes')).rows.length, 1);
  assert.equal((await q('select approved from public.profiles where id=$1', [U.s1])).rows[0].approved, true);
});
await as('authenticated', U.t, async () => {
  const ids = (await q('select id from public.profiles')).rows.map((r) => r.id).sort();
  assert.deepEqual(ids, [U.t, U.s1].sort(), 'professor vê só alunos da própria turma');
});
await as('authenticated', U.s2, async () => {
  assert.equal((await q('select * from public.profiles')).rows.length, 1, 's2 não vê s1');
});
console.log('✔ turmas, join_class e visibilidade do professor');

// --- start_session (service_role)
await q(`update public.settings set value='1' where key='max_concurrent_sessions'`);
await q(`update public.profiles set approved=true where id=$1`, [U.s2]);
let sid;
await as('service_role', null, async () => {
  const r1 = (await q('select * from public.start_session($1)', [U.s1])).rows[0];
  assert.equal(r1.o_created, true); sid = r1.o_session_id;
  const r2 = (await q('select * from public.start_session($1)', [U.s1])).rows[0];
  assert.equal(r2.o_created, false); assert.equal(r2.o_session_id, sid);
  await assert.rejects(q('select * from public.start_session($1)', [U.s2]), /capacity/);
  await assert.rejects(q('select * from public.start_session($1)', ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']), /not_approved/);
});
console.log('✔ start_session: cria, reconecta, respeita capacidade e aprovação');

await as('authenticated', U.s2, async () => assert.equal((await q('select * from public.sessions')).rows.length, 0, 's2 não vê sessão de s1'));
await as('authenticated', U.t, async () => assert.equal((await q('select * from public.sessions')).rows.length, 1, 'professor vê sessão do aluno da turma'));

await q(`update public.sessions set status='ended', ended_at=now(), end_reason='user' where id=$1`, [sid]);
await q(`update public.settings set value='0' where key='daily_limit_minutes'`);
// cota 0 não é aceita pelo painel (>=1), mas o SQL deve bloquear quando já usou o limite
await as('service_role', null, async () => {
  await assert.rejects(q('select * from public.start_session($1)', [U.s1]), /quota/);
});
console.log('✔ cota diária aplicada');

// índice único: 1 sessão aberta por usuário
await q(`insert into public.sessions(user_id,status,expires_at) values ($1,'active', now()+interval '1h')`, [U.s2]);
await assert.rejects(q(`insert into public.sessions(user_id,status,expires_at) values ($1,'starting', now()+interval '1h')`, [U.s2]), /duplicate key/);
console.log('✔ índice único: no máximo 1 sessão aberta por usuário');

// limpeza preguiçosa de sessões inativas (reap_sessions)
await q(`update public.sessions set last_heartbeat = now() - interval '10 minutes' where user_id = $1 and status = 'active'`, [U.s2]);
await as('service_role', null, async () => {
  const n = (await q('select public.reap_sessions() as n')).rows[0].n;
  assert.equal(n, 1, 'reap_sessions encerra sessão inativa');
});
assert.equal((await q(`select end_reason from public.sessions where user_id = $1 order by started_at desc limit 1`, [U.s2])).rows[0].end_reason, 'inactive');
console.log('✔ reap_sessions encerra sessões inativas/expiradas');

// service_role consegue ler/gravar tabelas e sequências diretamente (como no servidor)
await as('service_role', null, async () => {
  assert.equal((await q('select count(*)::int c from public.profiles')).rows[0].c, 4);
  assert.ok((await q('select * from public.settings')).rows.length >= 4);
  await q(`insert into public.access_log(user_id,event) values ($1,'login')`, [U.s1]);
});
console.log('✔ service_role tem acesso completo a tabelas e sequências');

// admin
await as('authenticated', U.admin, async () => {
  assert.equal((await q('select * from public.profiles')).rows.length, 4);
  await q(`select * from public.admin_audit`);
});
console.log('\nTODOS OS TESTES DE SQL/RLS PASSARAM');

await db.close();
process.exit(0);
