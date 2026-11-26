import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { heartbeatForUser } from '@/lib/sessions';

export const maxDuration = 15;
export const dynamic = 'force-dynamic';

/** Batimento enquanto o estudante usa o simulador; detecta expiração ou encerramento pelo admin. */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const result = await heartbeatForUser(user.id);
  if (!result) return NextResponse.json({ error: 'Sessão encerrada' }, { status: 410 });
  return NextResponse.json({ ok: true, expiresAt: result.expiresAt });
}
