import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const portalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(portalDir, '..');

// 1. Copia os arquivos estáticos do Ruffle (open-source) para public/ruffle/
const ruffleSrc = path.join(portalDir, 'node_modules', '@ruffle-rs', 'ruffle');
const ruffleDst = path.join(portalDir, 'public', 'ruffle');

if (fs.existsSync(ruffleSrc)) {
  fs.mkdirSync(ruffleDst, { recursive: true });
  let copied = 0;
  for (const name of fs.readdirSync(ruffleSrc)) {
    if (name.endsWith('.js') || name.endsWith('.wasm')) {
      fs.copyFileSync(path.join(ruffleSrc, name), path.join(ruffleDst, name));
      copied++;
    }
  }
  console.log(`[prepare-assets] Ruffle copiado para public/ruffle/ (${copied} arquivos).`);
} else {
  console.warn('[prepare-assets] Aviso: @ruffle-rs/ruffle não encontrado em node_modules.');
}

// 2. Extrai Simulador.swf (somente leitura) e copia Images/ + XML/ de ../simulador para portal/sim-assets/
const simSrc = path.join(repoRoot, 'simulador');
const exePath = path.join(simSrc, 'Simulador.exe');
const simDst = path.join(portalDir, 'sim-assets');

if (!fs.existsSync(exePath)) {
  console.log('[prepare-assets] Pasta ../simulador não presente neste ambiente (ex.: build na Vercel).');
  console.log('[prepare-assets] Em produção, o portal lerá os arquivos do bucket privado do Supabase Storage.');
  process.exit(0);
}

fs.mkdirSync(path.join(simDst, 'images'), { recursive: true });
fs.mkdirSync(path.join(simDst, 'XML'), { recursive: true });

const exe = fs.readFileSync(exePath);
const magic = exe.readUInt32LE(exe.length - 8);
const swfSize = exe.readUInt32LE(exe.length - 4);
if (magic !== 0xfa123456) {
  throw new Error(`Assinatura de projetor Macromedia ausente em Simulador.exe (0x${magic.toString(16)})`);
}
const swfStart = exe.length - 8 - swfSize;
const swf = exe.subarray(swfStart, swfStart + swfSize);
const header = swf.subarray(0, 3).toString('ascii');
if (header !== 'FWS' && header !== 'CWS') {
  throw new Error(`Cabeçalho SWF inválido após extração: ${header}`);
}
fs.writeFileSync(path.join(simDst, 'Simulador.swf'), swf);

// Images/ -> sim-assets/images/ (minúsculo para compatibilidade Linux/Vercel, sem sobras .tmp/Thumbs.db)
const imgSrc = path.join(simSrc, 'Images');
let imgCount = 0;
for (const name of fs.readdirSync(imgSrc)) {
  const lower = name.toLowerCase();
  if (lower === 'thumbs.db' || lower.endsWith('.tmp')) continue;
  const full = path.join(imgSrc, name);
  if (fs.statSync(full).isFile()) {
    fs.copyFileSync(full, path.join(simDst, 'images', name));
    imgCount++;
  }
}

// XML/ -> sim-assets/XML/ (ignora .LCK e Portuguese___.xml que é do Gerenciador BXP)
const xmlSrc = path.join(simSrc, 'XML');
let xmlCount = 0;
for (const name of fs.readdirSync(xmlSrc)) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.lck') || lower === 'portuguese___.xml') continue;
  const full = path.join(xmlSrc, name);
  if (fs.statSync(full).isFile()) {
    fs.copyFileSync(full, path.join(simDst, 'XML', name));
    xmlCount++;
  }
}

console.log(`[prepare-assets] Simulador extraído (somente leitura) para portal/sim-assets/: SWF (${swf.length} B), ${imgCount} imagens/SWFs, ${xmlCount} XMLs.`);
