import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { reapStaleSessions } from '@/lib/sessions';
import { joinClass, createClass, removeMember } from './actions';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : '—');

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireProfile();
  await reapStaleSessions();
  const isStaff = profile.role === 'teacher' || profile.role === 'admin';

  const [{ data: memberships }, { data: history }, { data: open }] = await Promise.all([
    supabase.from('class_members').select('class_id, classes(name)').eq('user_id', user.id),
    supabase.from('sessions').select('id,status,started_at,ended_at,end_reason').eq('user_id', user.id).order('started_at', { ascending: false }).limit(5),
    supabase.from('sessions').select('id,expires_at').eq('user_id', user.id).in('status', ['starting', 'active']).maybeSingle(),
  ]);

  const owned = isStaff
    ? (await supabase.from('classes').select('id,name,join_code,class_members(user_id,profiles(full_name,email))').eq('owner_id', user.id).order('created_at')).data ?? []
    : [];

  return (
    <main className="container page">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Olá, {profile.full_name.split(' ')[0] || 'estudante'} 👋</h1>
          <p className="muted" style={{ marginBottom: 0 }}>Perfil: {profile.role === 'student' ? 'Estudante' : profile.role === 'teacher' ? 'Professor' : 'Administrador'}</p>
        </div>
      </div>

      {sp.error && <div className="alert alert-bad">{sp.error}</div>}
      {sp.ok && <div className="alert alert-ok">Turma vinculada com sucesso.</div>}

      <div className="grid grid-2">
        <section className="card">
          <h2>Simulador</h2>
          {!profile.approved ? (
            <>
              <div className="alert alert-warn">Sua conta ainda não foi liberada. Informe o código da turma fornecido pelo professor.</div>
              <form action={joinClass} className="row">
                <div><label htmlFor="code">Código da turma</label><input id="code" name="code" required maxLength={16} placeholder="Ex.: A1B2C3D4" /></div>
                <button className="btn btn-primary">Entrar na turma</button>
              </form>
            </>
          ) : open ? (
            <>
              <p><span className="badge badge-ok">Sessão em andamento</span></p>
              <p className="muted">Expira em {fmt(open.expires_at)}.</p>
              <Link href="/simulator" className="btn btn-primary">Voltar ao simulador</Link>
            </>
          ) : (
            <>
              <p className="muted">Abra o Intel Simulator original em um ambiente exclusivo seu.</p>
              <Link href="/simulator" className="btn btn-primary">Abrir simulador</Link>
            </>
          )}
        </section>

        <section className="card">
          <h2>Minhas turmas</h2>
          {memberships?.length ? (
            <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
              {memberships.map((m) => {
                const c = m.classes as unknown as { name: string } | null;
                return <li key={m.class_id}>{c?.name}</li>;
              })}
            </ul>
          ) : <p className="muted">Você ainda não participa de nenhuma turma.</p>}
          {profile.approved && (
            <form action={joinClass} className="row" style={{ marginTop: '1rem' }}>
              <div><label htmlFor="code2">Entrar em outra turma</label><input id="code2" name="code" required maxLength={16} /></div>
              <button className="btn">Entrar</button>
            </form>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="page-head" style={{ marginBottom: '.5rem' }}>
          <h2 style={{ margin: 0 }}>Últimos acessos</h2>
          <Link href="/sessions">Ver todas →</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Início</th><th>Fim</th><th>Situação</th></tr></thead>
            <tbody>
              {(history ?? []).map((s) => (
                <tr key={s.id}><td>{fmt(s.started_at)}</td><td>{fmt(s.ended_at)}</td><td><span className="badge">{s.status === 'active' ? 'ativa' : s.end_reason ?? s.status}</span></td></tr>
              ))}
              {!history?.length && <tr><td colSpan={3} className="muted">Nenhum acesso registrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {isStaff && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h2>Turmas que eu gerencio</h2>
          <form action={createClass} className="row" style={{ marginBottom: '1rem' }}>
            <div><label htmlFor="name">Nova turma</label><input id="name" name="name" required minLength={2} maxLength={120} placeholder="Ex.: Manutenção de Computadores 2026.2" /></div>
            <button className="btn btn-primary">Criar turma</button>
          </form>
          {owned.map((c) => {
            const members = (c.class_members ?? []) as unknown as { user_id: string; profiles: { full_name: string; email: string } | null }[];
            return (
              <div key={c.id} className="card" style={{ background: 'var(--panel-2)', marginBottom: '.75rem' }}>
                <strong>{c.name}</strong> · código <code>{c.join_code}</code> · {members.length} aluno(s)
                <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
                  {members.map((m) => (
                    <li key={m.user_id}>
                      {m.profiles?.full_name || m.profiles?.email}{' '}
                      <form action={removeMember} className="inline">
                        <input type="hidden" name="class_id" value={c.id} /><input type="hidden" name="user_id" value={m.user_id} />
                        <button className="btn btn-sm btn-danger" style={{ marginLeft: '.5rem' }}>remover</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
