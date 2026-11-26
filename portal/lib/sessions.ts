import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export class SessionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const RPC_ERRORS: Record<string, [number, string]> = {
  not_approved: [403, 'Sua conta ainda não foi liberada. Informe o código da turma no painel.'],
  capacity: [429, 'Todas as vagas do simulador estão ocupadas no momento. Tente novamente em alguns minutos.'],
  quota: [429, 'Você atingiu o limite diário de uso do simulador.'],
};

export interface StartResult {
  sessionId: string;
  expiresAt: string;
  reconnected: boolean;
}

export async function logAccess(
  userId: string | null,
  event: string,
  meta: { ip?: string | null; userAgent?: string | null },
  sessionId?: string,
  details?: Record<string, unknown>,
) {
  const admin = createAdminClient();
  await admin.from('access_log').insert({
    user_id: userId,
    session_id: sessionId ?? null,
    event,
    ip: meta.ip ?? null,
    user_agent: meta.userAgent ?? null,
    details,
  });
}

export async function reapStaleSessions() {
  const admin = createAdminClient();
  await admin.rpc('reap_sessions');
}

export async function markEnded(sessionId: string, reason: string, status: 'ended' | 'failed' = 'ended') {
  const admin = createAdminClient();
  const { data } = await admin
    .from('sessions')
    .update({ status, ended_at: new Date().toISOString(), end_reason: reason })
    .eq('id', sessionId)
    .in('status', ['starting', 'active'])
    .select('user_id');
  return data?.[0]?.user_id as string | undefined;
}

/** Cria (ou reconecta) a sessão do estudante no Supabase, aplicando aprovação, capacidade e cota diária. */
export async function startForUser(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<StartResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('start_session', { p_user: userId });
  if (error) {
    const hit = Object.entries(RPC_ERRORS).find(([k]) => error.message.includes(k));
    if (hit) throw new SessionError(hit[1][0], hit[1][1]);
    console.error('[start_session]', error);
    throw new SessionError(500, 'Não foi possível iniciar a sessão.');
  }
  const row = data[0] as { o_session_id: string; o_created: boolean; o_expires_at: string };

  if (row.o_created) {
    await admin
      .from('sessions')
      .update({ client_ip: meta.ip ?? null, user_agent: meta.userAgent ?? null, last_heartbeat: new Date().toISOString() })
      .eq('id', row.o_session_id);
  }
  await logAccess(userId, row.o_created ? 'session_start' : 'session_reconnect', meta, row.o_session_id);
  return { sessionId: row.o_session_id, expiresAt: row.o_expires_at, reconnected: !row.o_created };
}

/** Atualiza o batimento da sessão aberta; devolve null se expirada ou encerrada (ex.: pelo admin). */
export async function heartbeatForUser(userId: string): Promise<{ expiresAt: string } | null> {
  const admin = createAdminClient();
  await admin.rpc('reap_sessions');
  const { data: open } = await admin
    .from('sessions')
    .select('id,expires_at')
    .eq('user_id', userId)
    .in('status', ['starting', 'active'])
    .maybeSingle();

  if (!open) return null;
  if (new Date(open.expires_at) <= new Date()) {
    await markEnded(open.id, 'expired');
    return null;
  }

  await admin.from('sessions').update({ last_heartbeat: new Date().toISOString() }).eq('id', open.id);
  return { expiresAt: open.expires_at };
}

export async function stopSession(
  sessionId: string,
  reason: 'user' | 'restart' | 'admin',
  actorMeta: { ip?: string | null; userAgent?: string | null },
) {
  const userId = await markEnded(sessionId, reason);
  if (userId) await logAccess(userId, 'session_end', actorMeta, sessionId, { reason });
}
