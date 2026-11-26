import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { reapStaleSessions } from '@/lib/sessions';
import Viewer from './Viewer';

export const dynamic = 'force-dynamic';

export default async function SimulatorPage() {
  const { supabase, user, profile } = await requireProfile();
  if (!profile.approved) redirect('/dashboard');
  await reapStaleSessions();
  const { data: open } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['starting', 'active'])
    .maybeSingle();
  return <Viewer autoStart={!!open} />;
}
