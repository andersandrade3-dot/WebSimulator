import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.swf': 'application/x-shockwave-flash',
  '.xml': 'application/xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.png': 'image/png',
};

const LOCAL_ROOT = path.join(process.cwd(), 'sim-assets');
const BUCKET = process.env.SIM_STORAGE_BUCKET || 'simulator-assets';

function normalizeSegments(raw: string[]): string | null {
  if (!raw.length || raw.length > 4) return null;
  const clean: string[] = [];
  for (const part of raw) {
    if (!part || part === '.' || part === '..' || part.includes('\\') || part.includes('/') || part.includes('\0')) {
      return null;
    }
    clean.push(part);
  }
  // Normaliza apenas o diretório raiz (o SWF pede "images/" em minúsculas e "XML/" em maiúsculas)
  if (clean.length >= 2) {
    const first = clean[0].toLowerCase();
    if (first === 'images') clean[0] = 'images';
    else if (first === 'xml') clean[0] = 'XML';
  }
  const rel = clean.join('/');
  const ext = path.extname(rel).toLowerCase();
  if (!(ext in MIME)) return null;
  return rel;
}

async function readLocal(rel: string): Promise<Buffer | null> {
  const target = path.resolve(LOCAL_ROOT, rel);
  if (!target.startsWith(LOCAL_ROOT + path.sep)) return null;
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}

async function readStorage(rel: string): Promise<Buffer | null> {
  const admin = createAdminClient();
  const key = rel.replace(/ /g, '__SP__');
  const { data, error } = await admin.storage.from(BUCKET).download(key);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Entrega protegida dos arquivos do simulador (SWF, XML, imagens).
 * Exige usuário autenticado, aprovado/ativo e com sessão aberta não expirada.
 * Converte XMLs ISO-8859-1 para UTF-8 em trânsito para preservar acentos no Ruffle.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const [{ data: profile }, { data: open }] = await Promise.all([
    supabase.from('profiles').select('approved,active').eq('id', user.id).single(),
    supabase
      .from('sessions')
      .select('id,expires_at')
      .eq('user_id', user.id)
      .in('status', ['starting', 'active'])
      .maybeSingle(),
  ]);

  if (!profile?.active || !profile.approved || !open || new Date(open.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'Sessão inativa ou conta não liberada' }, { status: 403 });
  }

  const { path: rawSegments } = await ctx.params;
  const rel = normalizeSegments(rawSegments.map((s) => decodeURIComponent(s)));
  if (!rel) return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });

  let buf = await readLocal(rel);
  if (!buf) buf = await readStorage(rel);
  if (!buf) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });

  const ext = path.extname(rel).toLowerCase();
  if (ext === '.xml') {
    const head = buf.subarray(0, 120).toString('latin1');
    if (/ISO-8859-1/i.test(head)) {
      buf = Buffer.from(buf.toString('latin1').replace(/ISO-8859-1/i, 'UTF-8'), 'utf8');
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': MIME[ext],
      'Cache-Control': 'private, max-age=1800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
