import Link from 'next/link';
import { signIn, signUp } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const signup = sp.mode === 'signup';
  const error = sp.error === 'blocked' ? 'Sua conta está bloqueada. Procure o administrador.' : sp.error;

  return (
    <main className="container" style={{ maxWidth: 440, padding: '4rem 0' }}>
      <Link href="/" className="brand" style={{ marginBottom: '1.5rem' }}><span className="logo" /> Intel Simulator Online</Link>
      <div className="card">
        <h1 style={{ fontSize: '1.6rem' }}>{signup ? 'Criar conta' : 'Entrar'}</h1>
        <p className="muted">{signup ? 'Use seu e-mail institucional.' : 'Acesse com a conta cadastrada.'}</p>

        {error && <div className="alert alert-bad" role="alert">{error}</div>}
        {sp.info && <div className="alert alert-ok">{sp.info}</div>}

        {signup ? (
          <form action={signUp}>
            <div className="field"><label htmlFor="full_name">Nome completo</label><input id="full_name" name="full_name" required minLength={3} autoComplete="name" /></div>
            <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
            <div className="field"><label htmlFor="password">Senha (mín. 10 caracteres)</label><input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" /></div>
            <button className="btn btn-primary" style={{ width: '100%' }}>Criar conta</button>
            <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>Já tem conta? <Link href="/login">Entrar</Link></p>
          </form>
        ) : (
          <form action={signIn}>
            <input type="hidden" name="next" value={sp.next ?? '/dashboard'} />
            <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
            <div className="field"><label htmlFor="password">Senha</label><input id="password" name="password" type="password" required autoComplete="current-password" /></div>
            <button className="btn btn-primary" style={{ width: '100%' }}>Entrar</button>
            <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>Primeiro acesso? <Link href="/login?mode=signup">Criar conta</Link></p>
          </form>
        )}
      </div>
    </main>
  );
}
