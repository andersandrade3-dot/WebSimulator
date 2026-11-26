# Segurança (Etapa 8)

## Controles implementados

| Requisito | Implementação |
|---|---|
| **HTTPS obrigatório** | Fornecido automaticamente pela Vercel e pelo Supabase, com cabeçalho `Strict-Transport-Security` (HSTS). |
| **Autenticação sem atrito** | Supabase Auth criado no servidor (sem validação de e-mail): estudantes entram informando apenas o nome completo (+ código de turma opcional); professores e administradores entram na aba **Professor / Admin** com usuário (ou e-mail) e senha. `middleware.ts` bloqueia todas as rotas internas (`/dashboard`, `/simulator`, `/sessions`, `/admin`) e cada rota de API revalida `supabase.auth.getUser()` no servidor. |
| **Proteção dos arquivos do simulador** | Os arquivos (`Simulador.swf`, XMLs e imagens) **não** ficam em `public/` nem no GitHub. Ficam em um **bucket privado** do Supabase Storage e são servidos apenas por `/api/sim/[...path]`, que exige usuário logado, conta `approved && active` e **sessão aberta não expirada**. Validação contra *path traversal* e lista restrita de extensões permitidas. |
| **Controle de acesso e RLS** | Papéis `student`, `teacher`, `admin`. **Row Level Security (RLS)** ativo em todas as 7 tabelas. Estudantes só leem seus próprios dados; colunas `role`, `approved` e `active` não são graváveis por clientes (`grant update (full_name)` apenas). Professores veem apenas alunos de suas próprias turmas. |
| **Proteção de credenciais** | `SUPABASE_SERVICE_ROLE_KEY` marcada com `import 'server-only'`, nunca enviada ao navegador e fora do Git (`.gitignore` bloqueia `.env*`). |
| **Isolamento das sessões** | Cada estudante executa sua própria instância isolada do simulador na sandbox WebAssembly do navegador (sem servidor compartilhado, sem risco de vazamento de tela entre estudantes). Índice único no banco permite no máximo **1 sessão aberta por usuário**. |
| **Controle de tempo e limites** | Duração máxima por sessão (`max_session_minutes`), cota diária (`daily_limit_minutes`), encerramento por inatividade (`idle_minutes` + batimento a cada 30 s) e limite global simultâneo (`max_concurrent_sessions`), todos configuráveis pelo administrador e aplicados atomicamente no banco (`start_session` / `reap_sessions`). |
| **Encerramento remoto pelo admin** | Se um administrador encerrar uma sessão ou bloquear uma conta em `/admin`, o próximo batimento retorna `410`, destrói a instância do simulador na tela do aluno e bloqueia qualquer nova requisição a `/api/sim/*`. |
| **Registro e auditoria** | `access_log` registra logins, falhas de login, logouts, início, reconexão e encerramento de sessões (com IP e *user-agent*). `admin_audit` registra todas as ações administrativas (somente admins podem ler). |
| **Sem portas administrativas expostas** | Não há VPS, RDP, VNC nem SSH expostos à internet — toda a superfície é HTTPS na Vercel e Supabase. |
| **Cabeçalhos de segurança** | `Content-Security-Policy` (`frame-ancestors 'none'; object-src 'none'; base-uri 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| **Open redirect** | Parâmetro `next` do login validado para aceitar apenas caminhos relativos internos. |

## Boas práticas operacionais

1. **Mantenha o repositório GitHub privado** e nunca faça commit de `.env.local` ou da pasta `simulador/`.
2. **Altere periodicamente os códigos de turma** ou remova alunos antigos se quiser restringir o acesso a um semestre específico.
3. **LGPD**: o sistema armazena nome, e-mail, IP e horários de acesso. Informe os estudantes e faça limpeza periódica de `access_log` ao final do semestre/ano letivo.
