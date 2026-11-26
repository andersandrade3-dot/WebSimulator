'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireAdmin, clientMeta } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stopSession } from '@/lib/sessions';

async function audit(actorId: string, action: string, targetType: string, targetId: string, details?: Record<string, unknown>) {
  await createAdminClient().from('admin_audit').insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, details });
}

export async function terminateSession(formData: FormData) {
  const { user } = await requireAdmin();
  const id = String(formData.get('session_id'));
  await stopSession(id, 'admin', clientMeta(await headers()));
  await audit(user.id, 'terminate_session', 'session', id);
  revalidatePath('/admin');
}

export async function updateUser(formData: FormData) {
  const { user } = await requireAdmin();
  const target = String(formData.get('user_id'));
  const field = String(formData.get('field'));
  const raw = String(formData.get('value'));
  const admin = createAdminClient();

  let patch: Record<string, unknown>;
  if (field === 'role' && ['student', 'teacher', 'admin'].includes(raw)) patch = { role: raw };
  else if (field === 'approved' || field === 'active') patch = { [field]: raw === 'true' };
  else return;

  // evita que o administrador se tranque para fora
  if (target === user.id && (patch.role && patch.role !== 'admin' || patch.active === false)) return;

  await admin.from('profiles').update(patch).eq('id', target);
  if (patch.active === false) {
    const { data: open } = await admin.from('sessions').select('id').eq('user_id', target).in('status', ['starting', 'active']);
    for (const s of open ?? []) await stopSession(s.id, 'admin', clientMeta(await headers())).catch(() => {});
  }
  await audit(user.id, 'update_user', 'profile', target, patch);
  revalidatePath('/admin');
}

export async function updateSettings(formData: FormData) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  const changes: Record<string, number> = {};
  for (const key of ['max_concurrent_sessions', 'max_session_minutes', 'daily_limit_minutes', 'idle_minutes']) {
    const n = Number(formData.get(key));
    if (Number.isInteger(n) && n >= 1 && n <= 1440) changes[key] = n;
  }
  for (const [key, value] of Object.entries(changes)) await admin.from('settings').upsert({ key, value });
  await audit(user.id, 'update_settings', 'settings', 'global', changes);
  revalidatePath('/admin');
}
