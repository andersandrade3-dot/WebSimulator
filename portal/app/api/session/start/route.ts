import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { clientMeta } from '@/lib/auth';
import { startForUser, SessionError } from '@/lib/sessions';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Inicia (ou reconecta) a sessão do usuário autenticado. Idempotente. */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  try {
    const result = await startForUser(user.id, clientMeta(await headers()));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SessionError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[session/start]', e);
    return NextResponse.json({ error: 'Erro ao iniciar o simulador' }, { status: 500 });
  }
}
