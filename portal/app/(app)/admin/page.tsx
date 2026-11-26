import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { reapStaleSessions } from '@/lib/sessions';
import { terminateSession, updateUser, updateSettings } from './actions';

export const dynamic = 'force-dynamic';
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : '—');
type P = { full_name: string; email: string } | null;

export default async function AdminPage() {
  const { user } = await requireAdmin();
  await reapStaleSessions();
  const db = createAdminClient();

  const [open, recent, users, audit, settings] = await Promise.all([
    db.from('sessions').select('id,status,started_at,expires_at,client_ip,profiles(full_name,email)').in('status', ['starting', 'active']).order('started_at'),
    db.from('sessions').select('id,status,started_at,ended_at,end_reason,profiles(full_name,email)').in('status', ['ended', 'failed']).order('started_at', { ascending: false }).limit(15),
    db.from('profiles').select('id,full_name,email,role,approved,active,created_at').order('created_at', { ascending: false }).limit(200),
    db.from('admin_audit').select('id,action,target_type,target_id,details,created_at,profiles(full_name,email)').order('created_at', { ascending: false }).limit(20),
    db.from('settings').select('key,value'),
  ]);
  const cfg = Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value]));
  const who = (p: unknown) => { const x = p as P; return x?.full_name || x?.email || '—'; };

  return (
    <main className="container page">
      <div className="page-head">
        <h1 style={{ fontSize: '1.8rem' }}>Painel administrativo</h1>
        <div className="card" style={{ padding: '.6rem 1rem' }}>
          Sessões ativas <span className="stat">{open.data?.length ?? 0}</span> <span className="muted">/ {String(cfg.max_concurrent_sessions ?? 200)}</span>
        </div>
      </div>

      <section className="card">
        <h2>Sessões ativas</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Estudante</th><th>Início</th><th>Expira</th><th>IP</th><th /></tr></thead>
          <tbody>
            {(open.data ?? []).map((s) => (
              <tr key={s.id}><td>{who(s.profiles)}</td><td>{fmt(s.started_at)}</td><td>{fmt(s.expires_at)}</td><td>{s.client_ip ?? '—'}</td>
                <td><form action={terminateSession}><input type="hidden" name="session_id" value={s.id} /><button className="btn btn-sm btn-danger">Encerrar</button></form></td></tr>
            ))}
            {!open.data?.length && <tr><td colSpan={5} className="muted">Nenhuma sessão ativa.</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Limites de utilização</h2>
        <form action={updateSettings} className="row">
          <div><label htmlFor="mc">Sessões simultâneas</label><input id="mc" name="max_concurrent_sessions" type="number" min={1} max={1440} defaultValue={String(cfg.max_concurrent_sessions ?? 200)} /></div>
          <div><label htmlFor="mm">Duração máxima da sessão (min)</label><input id="mm" name="max_session_minutes" type="number" min={1} max={1440} defaultValue={String(cfg.max_session_minutes ?? 90)} /></div>
          <div><label htmlFor="dl">Cota diária por estudante (min)</label><input id="dl" name="daily_limit_minutes" type="number" min={1} max={1440} defaultValue={String(cfg.daily_limit_minutes ?? 240)} /></div>
          <div><label htmlFor="im">Encerrar por inatividade (min)</label><input id="im" name="idle_minutes" type="number" min={1} max={1440} defaultValue={String(cfg.idle_minutes ?? 3)} /></div>
          <button className="btn btn-primary">Salvar</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Usuários</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Liberado</th><th>Ativo</th></tr></thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.full_name || '—'}</td><td>{u.email}</td>
                <td>
                  <form action={updateUser} className="row" style={{ flexWrap: 'nowrap' }}>
                    <input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="field" value="role" />
                    <select name="value" defaultValue={u.role} aria-label="Perfil" disabled={u.id === user.id}>
                      <option value="student">Estudante</option><option value="teacher">Professor</option><option value="admin">Administrador</option>
                    </select>
                    <button className="btn btn-sm" disabled={u.id === user.id}>OK</button>
                  </form>
                </td>
                {(['approved', 'active'] as const).map((f) => (
                  <td key={f}>
                    <form action={updateUser}>
                      <input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="field" value={f} />
                      <input type="hidden" name="value" value={String(!u[f])} />
                      <button className={`btn btn-sm ${u[f] ? '' : 'btn-danger'}`} disabled={f === 'active' && u.id === user.id}>{u[f] ? 'Sim' : 'Não'}</button>
                    </form>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      <div className="grid grid-2" style={{ marginTop: '1rem' }}>
        <section className="card">
          <h2>Sessões recentes</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Estudante</th><th>Início</th><th>Fim</th><th>Motivo</th></tr></thead>
            <tbody>{(recent.data ?? []).map((s) => (<tr key={s.id}><td>{who(s.profiles)}</td><td>{fmt(s.started_at)}</td><td>{fmt(s.ended_at)}</td><td>{s.end_reason}</td></tr>))}</tbody>
          </table></div>
        </section>
        <section className="card">
          <h2>Auditoria administrativa</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr></thead>
            <tbody>{(audit.data ?? []).map((a) => (<tr key={a.id}><td>{fmt(a.created_at)}</td><td>{who(a.profiles)}</td><td>{a.action} <span className="muted">{a.target_type}</span></td></tr>))}</tbody>
          </table></div>
        </section>
      </div>
    </main>
  );
}
