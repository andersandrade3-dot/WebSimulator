import Link from 'next/link';

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <span className="brand"><span className="logo" /> Intel Simulator Online</span>
          <nav className="nav-links">
            <Link href="/login" className="btn btn-primary btn-sm">Entrar</Link>
          </nav>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>O <span className="gradient">Intel Simulator</span>,<br />direto no seu navegador.</h1>
          <p>Sem instalar nada. Os arquivos originais do simulador rodam em um ambiente isolado direto no navegador; basta entrar com sua conta da turma.</p>
          <div className="hero-actions">
            <Link href="/login" className="btn btn-primary">Acessar o simulador</Link>
            <a href="#como-funciona" className="btn">Como funciona</a>
          </div>
        </section>

        <section id="como-funciona" className="grid grid-3" style={{ paddingBottom: '4rem' }}>
          <article className="card">
            <h2>1. Entre com sua conta</h2>
            <p className="muted">Cadastre-se e informe o código da sua turma, fornecido pelo professor.</p>
          </article>
          <article className="card">
            <h2>2. Ambiente exclusivo</h2>
            <p className="muted">Cada estudante recebe uma sessão isolada. Ninguém vê a tela de outra pessoa.</p>
          </article>
          <article className="card">
            <h2>3. Use normalmente</h2>
            <p className="muted">Mouse, teclado e tela completos. Encerre ou reinicie o ambiente quando quiser.</p>
          </article>
        </section>
      </main>
      <footer className="container muted" style={{ padding: '2rem 0', fontSize: '.875rem' }}>
        © Intel Simulator Online · Uso exclusivo para atividades educacionais.
      </footer>
    </>
  );
}
