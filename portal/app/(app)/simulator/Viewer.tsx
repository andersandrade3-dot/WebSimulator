'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'starting' | 'running' | 'ended' | 'error';

interface RufflePlayerElement extends HTMLElement {
  load(options: Record<string, unknown>): Promise<void>;
}

interface RuffleGlobal {
  config?: Record<string, unknown>;
  newest?: () => { createPlayer: () => RufflePlayerElement };
}

declare global {
  interface Window {
    RufflePlayer?: RuffleGlobal;
  }
}

let ruffleLoader: Promise<void> | null = null;
function ensureRuffleLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.RufflePlayer?.newest) return Promise.resolve();
  if (!ruffleLoader) {
    window.RufflePlayer = {
      ...(window.RufflePlayer ?? {}),
      config: {
        publicPath: '/ruffle/',
        autoplay: 'on',
        unmuteOverlay: 'hidden',
        letterbox: 'on',
        contextMenu: 'off',
        splashScreen: false,
      },
    };
    ruffleLoader = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/ruffle/ruffle.js';
      s.async = true;
      s.onload = () => {
        if (window.RufflePlayer?.newest) resolve();
        else reject(new Error('Ruffle carregou mas não inicializou corretamente.'));
      };
      s.onerror = () => {
        ruffleLoader = null;
        reject(new Error('Não foi possível carregar o motor Ruffle (/ruffle/ruffle.js).'));
      };
      document.head.appendChild(s);
    });
  }
  return ruffleLoader;
}

const fmtRemaining = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default function Viewer({ autoStart }: { autoStart: boolean }) {
  const [phase, setPhase] = useState<Phase>(autoStart ? 'starting' : 'idle');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const [message, setMessage] = useState('');
  const [remaining, setRemaining] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const playerMount = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const clearPlayer = useCallback(() => {
    if (playerMount.current) playerMount.current.replaceChildren();
  }, []);

  const call = useCallback(async (endpoint: 'start' | 'restart') => {
    clearPlayer();
    setPhase('starting');
    setMessage('');
    try {
      const [res] = await Promise.all([
        fetch(`/api/session/${endpoint}`, { method: 'POST' }),
        ensureRuffleLoaded(),
      ]);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Falha ao abrir o simulador');
      setExpiresAt(body.expiresAt);
      setRunNonce((n) => n + 1);
      setPhase('running');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha ao abrir o simulador');
      setPhase('error');
    }
  }, [clearPlayer]);

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void call('start');
    }
  }, [autoStart, call]);

  // Monta uma instância limpa do Ruffle sempre que a sessão inicia ou reinicia
  useEffect(() => {
    if (phase !== 'running' || !runNonce || !playerMount.current) return;
    const mount = playerMount.current;
    let cancelled = false;

    const ruffle = window.RufflePlayer?.newest?.();
    if (!ruffle) {
      setMessage('Motor de execução indisponível neste navegador.');
      setPhase('error');
      return;
    }

    const player = ruffle.createPlayer();
    player.style.width = '100%';
    player.style.height = '100%';
    player.style.display = 'block';
    mount.replaceChildren(player);

    player
      .load({
        url: '/api/sim/Simulador.swf',
        base: '/api/sim/',
        allowScriptAccess: false,
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[ruffle.load]', err);
        setMessage('Não foi possível carregar os arquivos do simulador. Verifique se os arquivos foram publicados no servidor.');
        setPhase('error');
      });

    return () => {
      cancelled = true;
      mount.replaceChildren();
    };
  }, [phase, runNonce]);

  // Batimento: mantém a sessão viva e detecta encerramento pelo administrador ou expiração
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(async () => {
      const res = await fetch('/api/session/heartbeat', { method: 'POST' }).catch(() => null);
      if (res && res.status === 410) {
        clearPlayer();
        setExpiresAt(null);
        setMessage('Sua sessão foi encerrada (tempo esgotado ou encerrada pelo administrador).');
        setPhase('ended');
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [phase, clearPlayer]);

  // Contagem regressiva local do tempo máximo de sessão
  useEffect(() => {
    if (phase !== 'running' || !expiresAt) return;
    const deadline = new Date(expiresAt).getTime();
    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearPlayer();
        setExpiresAt(null);
        setMessage('O tempo máximo desta sessão foi atingido.');
        setPhase('ended');
        void fetch('/api/session/heartbeat', { method: 'POST' }).catch(() => { });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, expiresAt, clearPlayer]);

  const stop = async () => {
    if (!confirm('Encerrar a sessão? O progresso atual no simulador será reiniciado.')) return;
    clearPlayer();
    await fetch('/api/session/stop', { method: 'POST' });
    setExpiresAt(null);
    setMessage('Sessão encerrada.');
    setPhase('ended');
  };

  const restart = async () => {
    if (!confirm('Reiniciar o ambiente? O simulador voltará ao estado inicial.')) return;
    await call('restart');
  };

  return (
    <div className="viewer-shell">
      <div className="viewer-bar">
        <strong>Intel Simulator</strong>
        {phase === 'running' && <span className="badge badge-ok">Sessão ativa · restam {fmtRemaining(remaining)}</span>}
        {phase === 'starting' && <span className="badge badge-warn">Preparando simulador…</span>}
        <span className="spacer" />
        {phase === 'running' && (
          <>
            <button className="btn btn-sm" onClick={() => stage.current?.requestFullscreen?.()}>Tela cheia</button>
            <button className="btn btn-sm" onClick={restart}>Reiniciar ambiente</button>
            <button className="btn btn-sm btn-danger" onClick={stop}>Encerrar sessão</button>
          </>
        )}
      </div>

      <div className="viewer-stage" ref={stage}>
        <div
          ref={playerMount}
          className="viewer-mount"
          style={{ display: phase === 'running' ? 'block' : 'none' }}
        />

        {phase === 'idle' && (
          <div className="viewer-msg">
            <div>
              <h2>Pronto para começar?</h2>
              <p className="muted">O Intel Simulator será carregado diretamente no seu navegador, em um ambiente isolado exclusivo para você.</p>
              <button className="btn btn-primary" onClick={() => call('start')}>Iniciar simulador</button>
            </div>
          </div>
        )}
        {phase === 'starting' && (
          <div className="viewer-msg"><div><div className="spinner" /><p>Carregando o Intel Simulator…</p></div></div>
        )}
        {(phase === 'ended' || phase === 'error') && (
          <div className="viewer-msg">
            <div>
              <h2>{phase === 'error' ? 'Não foi possível abrir' : 'Sessão finalizada'}</h2>
              <p className="muted">{message}</p>
              <button className="btn btn-primary" onClick={() => call('start')}>Iniciar nova sessão</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
