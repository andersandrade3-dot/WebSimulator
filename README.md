# Intel Simulator Online

Portal educacional **100% gratuito** (Vercel + Supabase + Ruffle) para executar o **Intel Simulator** diretamente no navegador, sem instalar nada nos computadores dos estudantes e sem precisar contratar VPS.

```
Navegador do aluno ──HTTPS──> Portal Next.js (Vercel Hobby, grátis)
       │                            ├──> Supabase Auth + Postgres (turmas, sessões, RLS)
       │                            └──> /api/sim/* ──> Supabase Storage privado (SWF, XML, imagens)
       └── Ruffle (WASM em /ruffle/*) executa o Simulador.swf original isolado na aba do aluno
```

## Como funciona (e nota de transparência)
Na auditoria técnica ([docs/01](docs/01-AUDITORIA-E-ESTRATEGIA.md)), descobrimos que `simulador/Simulador.exe` é um **projetor Macromedia Flash Player 7** com o arquivo **`Simulador.swf`** (756 KB, ActionScript 2) embutido ao final.
- **Solução ativa (gratuita):** extraímos somente-leitura o `Simulador.swf` original (sem reescrever nem alterar a lógica do simulador) e o executamos no navegador com **Ruffle** (WebAssembly). O `Simulador.exe` permanece intacto.
- **Alternativa arquivada:** caso um dia você opte por contratar uma VPS Linux KVM para executar o `Simulador.exe` original sob Wine + Apache Guacamole, os arquivos Docker/Caddy/orquestrador foram preservados em `alternativa-wine-vps/`.

## Estrutura do projeto

| Pasta | Conteúdo |
|---|---|
| `simulador/` | Arquivos **originais, intocados** (no `.gitignore`: não vai ao GitHub) |
| `portal/` | Aplicação Next.js 15: início, login, painel, simulador (Ruffle), sessões, administração, rota autenticada `/api/sim/*` e scripts `sim:prepare` / `sim:upload` |
| `supabase/` | Migração SQL (`0001_init.sql`: tabelas, RLS, funções de turma e sessão) e testes automatizados de RLS |
| `docs/` | Auditoria/estratégia, guia de deploy gratuito, segurança e testes |
| `alternativa-wine-vps/` | Infraestrutura arquivada para execução remota via Wine + Guacamole em VPS paga (opcional) |

## Publicação gratuita em 4 passos (15 min)

Veja o guia completo em [docs/02-DEPLOY.md](docs/02-DEPLOY.md):

1. **Supabase (grátis):** crie um projeto e execute `supabase/migrations/0001_init.sql` no SQL Editor.
2. **Enviar arquivos originais ao Storage privado:** configure `portal/.env.local` e rode `cd portal && npm install && npm run sim:upload`.
3. **GitHub (repositório privado):** faça o push do projeto (nem `simulador/` nem segredos são enviados).
4. **Vercel (grátis):** importe o repo com *Root Directory* = `portal` e informe as 3 variáveis do Supabase.

## Desenvolvimento local e testes

```powershell
# Rodar o portal localmente (usa portal/sim-assets/ extraído automaticamente de ../simulador/)
cd portal
copy .env.example .env.local   # preencha as 3 chaves do Supabase
npm install
npm run dev

# Testar migração SQL + RLS localmente (PostgreSQL embutido)
cd supabase/tests
npm install
npm test
```

## Estado de validação

| Item | Estado |
|---|---|
| Auditoria do `Simulador.exe` (intocado, SHA-256 preservado) | ✅ concluída ([docs/01](docs/01-AUDITORIA-E-ESTRATEGIA.md)) |
| Execução real do simulador no Chrome com Ruffle (interface, mouse, pontuação e acentos PT-BR) | ✅ validada |
| Banco de dados + políticas RLS (`supabase/tests/rls.test.mjs`) | ✅ passam |
| Portal Next.js (`tsc --noEmit` + `next build`) | ✅ passa |
| Publicação nas suas contas Supabase + Vercel + teste em produção | ⏳ aguardando suas credenciais ([docs/02-DEPLOY.md](docs/02-DEPLOY.md)) |
