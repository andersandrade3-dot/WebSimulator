'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';

export async function joinClass(formData: FormData) {
  const { supabase } = await requireProfile();
  const code = String(formData.get('code') ?? '').trim();
  const { error } = await supabase.rpc('join_class', { p_code: code });
  if (error) redirect(`/dashboard?error=${encodeURIComponent(error.message.includes('invalid_code') ? 'Código de turma inválido.' : 'Não foi possível entrar na turma.')}`);
  revalidatePath('/dashboard');
  redirect('/dashboard?ok=1');
}

/** Professores/administradores criam turmas; o RLS (classes_insert) impede que estudantes o façam. */
export async function createClass(formData: FormData) {
  const { supabase, user } = await requireProfile();
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) redirect('/dashboard?error=Informe+o+nome+da+turma.');
  const { error } = await supabase.from('classes').insert({ name, owner_id: user.id });
  if (error) redirect('/dashboard?error=Sem+permiss%C3%A3o+para+criar+turmas.');
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function removeMember(formData: FormData) {
  const { supabase } = await requireProfile();
  await supabase
    .from('class_members')
    .delete()
    .eq('class_id', String(formData.get('class_id')))
    .eq('user_id', String(formData.get('user_id')));
  revalidatePath('/dashboard');
}
