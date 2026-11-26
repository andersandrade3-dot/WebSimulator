/** Marca a sessão como encerrada no Supabase (service_role, apenas no servidor) e registra o histórico. */
export function makeSupabaseEnder(cfg, fetchImpl = fetch) {
  return async function onEnded(sessionId, reason) {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return;
    const headers = {
      apikey: cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
      'Content-Type': 'application/json',
    };
    try {
      const status = reason === 'failed' ? 'failed' : 'ended';
      const res = await fetchImpl(
        `${cfg.supabaseUrl}/rest/v1/sessions?id=eq.${sessionId}&status=in.(starting,active)&select=id,user_id`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ status, ended_at: new Date().toISOString(), end_reason: reason }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (rows.length) {
        await fetchImpl(`${cfg.supabaseUrl}/rest/v1/access_log`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ user_id: rows[0].user_id, session_id: sessionId, event: 'session_end', details: { reason, by: 'orchestrator' } }),
          signal: AbortSignal.timeout(10_000),
        });
      }
    } catch (e) {
      console.error(`[supabase] não foi possível registrar o fim da sessão ${sessionId}:`, e.message);
    }
  };
}
