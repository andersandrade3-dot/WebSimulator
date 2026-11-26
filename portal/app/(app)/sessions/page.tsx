import { requireProfile } from '@/lib/auth';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : '—');
const REASONS: Record<string, string> = {
  user: 'Encerrada por você', restart: 'Reiniciada', expired: 'Tempo máximo atingido', inactive: 'Inatividade',
  admin: 'Encerrada pelo administrador', app_closed: 'Simulador fechado', failed: 'Falha ao iniciar', lost: 'Perdida (servidor)',
};
const dur = (a: string, b?: string | null) => {
  const m = Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000);
  return `${m} min`;
};

export default async function SessionsPage() {
  const { supabase, user } = await requireProfile();
  const [{ data: sessions }, { data: log }] = await Promise.all([
    supabase.from('sessions').select('id,status,started_at,ended_at,end_reason').eq('user_id', user.id).order('started_at', { ascending: false }).limit(50),
    supabase.from('access_log').select('id,event,ip,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
  ]);

  return (
    <main className="container page">
      <div className="page-head"><h1 style={{ fontSize: '1.8rem' }}>Minhas sessões</h1></div>
      <section className="card">
        <h2>Histórico de uso</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Início</th><th>Fim</th><th>Duração</th><th>Situação</th></tr></thead>
            <tbody>
              {(sessions ?? []).map((s) => (
                <tr key={s.id}>
                  <td>{fmt(s.started_at)}</td><td>{fmt(s.ended_at)}</td><td>{dur(s.started_at, s.ended_at)}</td>
                  <td>{s.status === 'active' || s.status === 'starting' ? <span className="badge badge-ok">em andamento</span> : <span className="badge">{REASONS[s.end_reason ?? ''] ?? s.status}</span>}</td>
                </tr>
              ))}
              {!sessions?.length && <tr><td colSpan={4} className="muted">Nenhuma sessão.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Histórico de acessos à conta</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Evento</th><th>IP</th></tr></thead>
            <tbody>
              {(log ?? []).map((l) => (<tr key={l.id}><td>{fmt(l.created_at)}</td><td>{l.event}</td><td>{l.ip ?? '—'}</td></tr>))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
