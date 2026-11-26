'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientMeta } from '@/lib/auth';
import { logAccess } from '@/lib/sessions';

const safeNext = (n: FormDataEntryValue | null) => {
  const v = typeof n === 'string' ? n : '';
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/dashboard';
};
const enc = encodeURIComponent;

function toStaffEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
  // Permite entrar/cadastrar apenas com nome de usuário (ex.: prof.anderson)
  const slug = v.replace(/[^a-z0-9._-]/g, '');
  if (slug.length < 3 || slug !== v) return null;
  return `${slug}@equipe.intelsim.local`;
}

/** Acesso rápido do estudante: apenas Nome completo (+ código da turma opcional), sem e-mail nem senha. */
export async function enterAsStudent(formData: FormData) {
  const fullName = String(formData.get('full_name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const joinCode = String(formData.get('join_code') ?? '').trim().toUpperCase();
  const next = safeNext(formData.get('next'));
  const meta = clientMeta(await headers());

  if (fullName.length < 3) {
    redirect(`/login?error=${enc('Informe seu nome completo (mínimo 3 letras).')}&next=${enc(next)}`);
  }

  const admin = createAdminClient();

  let classId: string | null = null;
  if (joinCode) {
    const { data: cls } = await admin.from('classes').select('id').eq('join_code', joinCode).maybeSingle();
    if (!cls) {
      redirect(`/login?error=${enc('Código da turma inválido. Confira com o professor ou deixe o campo em branco.')}&next=${enc(next)}`);
    }
    classId = cls.id;
  }

  const email = `aluno-${crypto.randomUUID()}@estudante.intelsim.local`;
  const password = crypto.randomBytes(24).toString('base64url');

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !created.user) {
    console.error('[enterAsStudent:createUser]', createErr);
    redirect(`/login?error=${enc('Não foi possível iniciar seu acesso agora. Tente novamente.')}&next=${enc(next)}`);
  }

  // Garante aprovação imediata para usar o simulador (e vincula na turma, se informada)
  await admin.from('profiles').update({ full_name: fullName, approved: true }).eq('id', created.user.id);
  if (classId) {
    await admin.from('class_members').insert({ class_id: classId, user_id: created.user.id });
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    console.error('[enterAsStudent:signIn]', signInErr);
    redirect(`/login?error=${enc('Não foi possível abrir sua sessão. Tente novamente.')}&next=${enc(next)}`);
  }

  await logAccess(created.user.id, 'login', meta, undefined, { mode: 'student_name', class_id: classId });
  redirect(next);
}

/** Login da equipe (Professor / Admin) com usuário ou e-mail + senha. */
export async function signInStaff(formData: FormData) {
  const rawLogin = String(formData.get('login') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));
  const meta = clientMeta(await headers());

  const email = toStaffEmail(rawLogin);
  if (!email) {
    redirect(`/login?tab=staff&error=${enc('Usuário ou e-mail inválido.')}&next=${enc(next)}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await logAccess(null, 'login_failed', meta, undefined, { login: rawLogin });
    redirect(`/login?tab=staff&error=${enc('Usuário/e-mail ou senha incorretos.')}&next=${enc(next)}`);
  }
  await logAccess(data.user.id, 'login', meta, undefined, { mode: 'staff_password' });
  redirect(next);
}

/** Cadastro sem validação de e-mail para conta normal com usuário + senha (equipe / professor). */
export async function signUpStaff(formData: FormData) {
  const fullName = String(formData.get('full_name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const rawLogin = String(formData.get('login') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const meta = clientMeta(await headers());

  if (fullName.length < 3) {
    redirect(`/login?tab=staff&mode=signup&error=${enc('Informe seu nome completo.')}`);
  }
  const email = toStaffEmail(rawLogin);
  if (!email) {
    redirect(`/login?tab=staff&mode=signup&error=${enc('Use um usuário válido (letras, números, ponto, hífen ou _) ou um e-mail.')}`);
  }
  if (password.length < 6) {
    redirect(`/login?tab=staff&mode=signup&error=${enc('A senha deve ter ao menos 6 caracteres.')}`);
  }

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !created.user) {
    const msg = createErr?.message?.toLowerCase().includes('already')
      ? 'Esse usuário ou e-mail já está cadastrado.'
      : 'Não foi possível criar a conta. Tente outro usuário.';
    redirect(`/login?tab=staff&mode=signup&error=${enc(msg)}`);
  }

  // Entra imediatamente (sem precisar confirmar e-mail) e libera uso do simulador
  await admin.from('profiles').update({ full_name: fullName, approved: true }).eq('id', created.user.id);

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    redirect(`/login?tab=staff&info=${enc('Conta criada! Agora entre com seu usuário e senha.')}`);
  }

  await logAccess(created.user.id, 'login', meta, undefined, { mode: 'staff_signup' });
  redirect('/dashboard');
}

export async function signOut() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await logAccess(user.id, 'logout', clientMeta(await headers()));
  await supabase.auth.signOut();
  redirect('/');
}
