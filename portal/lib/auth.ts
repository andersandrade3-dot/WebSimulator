import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'student' | 'teacher' | 'admin';
export interface Profile {
  id: string;
  email: string | null;
  full_name: string;
  role: Role;
  approved: boolean;
  active: boolean;
}

export async function getUserAndProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,approved,active')
    .eq('id', user.id)
    .single<Profile>();
  return { supabase, user, profile };
}

export async function requireProfile() {
  const ctx = await getUserAndProfile();
  if (!ctx.user || !ctx.profile) redirect('/login');
  if (!ctx.profile.active) redirect('/login?error=blocked');
  return { supabase: ctx.supabase, user: ctx.user, profile: ctx.profile };
}

export async function requireAdmin() {
  const ctx = await requireProfile();
  if (ctx.profile.role !== 'admin') redirect('/dashboard');
  return ctx;
}

export function clientMeta(headers: Headers) {
  const ip = headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  return { ip, userAgent: headers.get('user-agent')?.slice(0, 300) ?? null };
}

export function displayLogin(email?: string | null): string {
  if (!email) return '—';
  if (email.endsWith('@estudante.intelsim.local')) return 'Acesso por nome';
  if (email.endsWith('@equipe.intelsim.local')) return email.replace(/@equipe\.intelsim\.local$/, '');
  return email;
}
