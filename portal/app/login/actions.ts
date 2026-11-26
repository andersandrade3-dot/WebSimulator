'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { clientMeta } from '@/lib/auth';
import { logAccess } from '@/lib/sessions';

const safeNext = (n: FormDataEntryValue | null) => {
  const v = typeof n === 'string' ? n : '';
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/dashboard';
};
const enc = encodeURIComponent;

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));
  const meta = clientMeta(await headers());

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await logAccess(null, 'login_failed', meta, undefined, { email });
    redirect(`/login?error=${enc('E-mail ou senha incorretos.')}&next=${enc(next)}`);
  }
  await logAccess(data.user.id, 'login', meta);
  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim().slice(0, 120);
  if (fullName.length < 3) redirect(`/login?mode=signup&error=${enc('Informe seu nome completo.')}`);
  if (password.length < 10) redirect(`/login?mode=signup&error=${enc('A senha deve ter ao menos 10 caracteres.')}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) redirect(`/login?mode=signup&error=${enc('Não foi possível criar a conta: ' + error.message)}`);
  redirect(`/login?info=${enc('Conta criada! Confirme o e-mail enviado para você e depois entre.')}`);
}

export async function signOut() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await logAccess(user.id, 'logout', clientMeta(await headers()));
  await supabase.auth.signOut();
  redirect('/');
}
