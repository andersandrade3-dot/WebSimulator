import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const portalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carrega .env.local automaticamente, se existir
for (const file of ['.env.local', '.env']) {
  const envPath = path.join(portalDir, file);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SIM_STORAGE_BUCKET || 'simulator-assets';

if (!url || !key) {
  console.error('Erro: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em portal/.env.local (ou no ambiente).');
  process.exit(1);
}

// Garante que portal/sim-assets/ está extraído e atualizado
const simDir = path.join(portalDir, 'sim-assets');
if (!fs.existsSync(path.join(simDir, 'Simulador.swf'))) {
  execFileSync(process.execPath, [path.join(portalDir, 'scripts', 'prepare-assets.mjs')], { stdio: 'inherit' });
}
if (!fs.existsSync(path.join(simDir, 'Simulador.swf'))) {
  console.error('Erro: portal/sim-assets/Simulador.swf não foi gerado. Verifique se a pasta simulador/ existe na raiz.');
  process.exit(1);
}

const MIME = {
  '.swf': 'application/x-shockwave-flash',
  '.xml': 'application/xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.png': 'image/png',
};

// Supabase Storage rejeita espaços em chaves de objeto; substitui de forma reversível
const toStorageKey = (rel) => rel.replace(/ /g, '__SP__');

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
if (listErr) throw listErr;
if (!buckets.some((b) => b.name === bucket)) {
  const { error: createErr } = await supabase.storage.createBucket(bucket, { public: false });
  if (createErr) throw createErr;
  console.log(`[sim:upload] Bucket privado "${bucket}" criado no Supabase Storage.`);
} else {
  console.log(`[sim:upload] Usando bucket privado "${bucket}".`);
}

const files = walk(simDir);
let ok = 0;
for (const f of files) {
  const storageKey = toStorageKey(f.rel);
  const ext = path.extname(f.rel).toLowerCase();
  const data = fs.readFileSync(f.full);
  const { error } = await supabase.storage.from(bucket).upload(storageKey, data, {
    upsert: true,
    contentType: MIME[ext] ?? 'application/octet-stream',
  });
  if (error) throw new Error(`Falha ao enviar ${f.rel} (${storageKey}): ${error.message}`);
  ok++;
}

console.log(`[sim:upload] Concluído: ${ok} arquivos enviados para o bucket privado "${bucket}".`);
