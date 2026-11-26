import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { clientMeta } from '@/lib/auth';
import { startForUser, stopSession, SessionError } from '@/lib/sessions';

export const maxDuration = 90;
export const dynamic = 'force-dynamic';

/** Reinicia o ambiente: destrói o container atual e cria um novo, limpo. */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const meta = clientMeta(await headers());
  try {
    const { data: open } = await supabase.from('sessions').select('id').eq('user_id', user.id).in('status', ['starting', 'active']);
    for (const s of open ?? []) await stopSession(s.id, 'restart', meta);
    return NextResponse.json(await startForUser(user.id, meta));
  } catch (e) {
    if (e instanceof SessionError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[session/restart]', e);
    return NextResponse.json({ error: 'Erro ao reiniciar o ambiente' }, { status: 500 });
  }
}
