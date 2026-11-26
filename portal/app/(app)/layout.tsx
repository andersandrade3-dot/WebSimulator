import Link from 'next/link';
import { requireProfile, displayLogin } from '@/lib/auth';
import { signOut } from '../login/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/dashboard" className="brand"><span className="logo" /> Intel Simulator Online</Link>
          <nav className="nav-links">
            <Link href="/dashboard">Painel</Link>
            <Link href="/simulator">Simulador</Link>
            <Link href="/sessions">Sessões</Link>
            {profile.role === 'admin' && <Link href="/admin">Administração</Link>}
            <span className="muted" style={{ padding: '0 .5rem', fontSize: '.875rem' }}>{profile.full_name || displayLogin(profile.email)}</span>
            <form action={signOut}><button type="submit">Sair</button></form>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
