import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { clientMeta } from '@/lib/auth';
import { stopSession } from '@/lib/sessions';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** Encerra a sessão aberta do próprio usuário (RLS garante que só enxerga as suas). */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: open } = await supabase.from('sessions').select('id').eq('user_id', user.id).in('status', ['starting', 'active']);
  try {
    for (const s of open ?? []) await stopSession(s.id, 'user', clientMeta(await headers()));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[session/stop]', e);
    return NextResponse.json({ error: 'Erro ao encerrar a sessão' }, { status: 502 });
  }
}
