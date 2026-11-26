import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserAndProfile } from '@/lib/auth';
import { enterAsStudent, signInStaff, signUpStaff } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const error = sp.error === 'blocked' ? 'Sua conta está bloqueada. Procure o administrador.' : sp.error;

  if (!error) {
    const { profile } = await getUserAndProfile();
    if (profile?.active) redirect('/dashboard');
  }

  const isStaff = sp.tab === 'staff';
  const signup = isStaff && sp.mode === 'signup';
  const next = sp.next ?? '/dashboard';

  return (
    <main className="container" style={{ maxWidth: 460, padding: '3.5rem 0' }}>
      <Link href="/" className="brand" style={{ marginBottom: '1.5rem' }}><span className="logo" /> Intel Simulator Online</Link>

      <div className="tabs" role="tablist">
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={`tab ${!isStaff ? 'tab-active' : ''}`} role="tab" aria-selected={!isStaff}>
          Estudante
        </Link>
        <Link href={`/login?tab=staff&next=${encodeURIComponent(next)}`} className={`tab ${isStaff ? 'tab-active' : ''}`} role="tab" aria-selected={isStaff}>
          Professor / Admin
        </Link>
      </div>

      <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        {error && <div className="alert alert-bad" role="alert">{error}</div>}
        {sp.info && <div className="alert alert-ok">{sp.info}</div>}

        {!isStaff ? (
          <>
            <h1 style={{ fontSize: '1.55rem' }}>Acesso do estudante</h1>
            <p className="muted">Não precisa de e-mail nem senha. Digite apenas seu nome completo para começar.</p>
            <form action={enterAsStudent}>
              <input type="hidden" name="next" value={next} />
              <div className="field">
                <label htmlFor="full_name">Nome completo</label>
                <input id="full_name" name="full_name" required minLength={3} maxLength={120} placeholder="Ex.: Maria Silva" autoComplete="name" autoFocus />
              </div>
              <div className="field">
                <label htmlFor="join_code">Código da turma <span className="muted">(opcional)</span></label>
                <input id="join_code" name="join_code" maxLength={16} placeholder="Se o professor informou um código" />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }}>Entrar no portal</button>
            </form>
          </>
        ) : signup ? (
          <>
            <h1 style={{ fontSize: '1.55rem' }}>Criar conta (Equipe)</h1>
            <p className="muted">Sem validação de e-mail. Após criar, o administrador pode liberar o perfil de professor.</p>
            <form action={signUpStaff}>
              <div className="field">
                <label htmlFor="s_name">Nome completo</label>
                <input id="s_name" name="full_name" required minLength={3} maxLength={120} autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor="s_login">Usuário ou e-mail</label>
                <input id="s_login" name="login" required minLength={3} placeholder="Ex.: prof.anderson" autoComplete="username" />
              </div>
              <div className="field">
                <label htmlFor="s_pass">Senha (mín. 6 caracteres)</label>
                <input id="s_pass" name="password" type="password" required minLength={6} autoComplete="new-password" />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }}>Criar conta e entrar</button>
              <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
                Já tem conta? <Link href={`/login?tab=staff&next=${encodeURIComponent(next)}`}>Entrar</Link>
              </p>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: '1.55rem' }}>Professor / Administrador</h1>
            <p className="muted">Entre com seu usuário (ou e-mail) e senha.</p>
            <form action={signInStaff}>
              <input type="hidden" name="next" value={next} />
              <div className="field">
                <label htmlFor="login">Usuário ou e-mail</label>
                <input id="login" name="login" required placeholder="Ex.: prof.anderson ou seu@email.com" autoComplete="username" />
              </div>
              <div className="field">
                <label htmlFor="password">Senha</label>
                <input id="password" name="password" type="password" required autoComplete="current-password" />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }}>Entrar</button>
              <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
                Novo professor? <Link href={`/login?tab=staff&mode=signup&next=${encodeURIComponent(next)}`}>Criar conta sem validar e-mail</Link>
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
