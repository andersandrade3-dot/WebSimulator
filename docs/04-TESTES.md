# Testes e critérios de aceitação (Etapa 9)

## A. Testes já executados e aprovados

| Teste | O que foi verificado | Resultado |
|---|---|---|
| **Execução real do simulador no Chrome via Ruffle** | Extração somente-leitura de `Simulador.swf` (756.752 B, `CWS` v7) + `Images/` + `XML/` + transcodificação ISO-8859-1 → UTF-8. Verificado visualmente em screenshots: tela de abertura Intel (`INÍCIO DO JOGO`), interface completa de hardware e software, sintomas de defeito (`HDD Failure`), interação por mouse, penalidade de pontuação (`10000 → 9960`), aviso de procedimento com computador ligado e **todos os acentos em português corretos** (`Você não pode executar... Clique no botão ligar/desligar`). | ✅ Passou |
| **Integridade do programa original** | SHA-256 de `simulador/Simulador.exe` idêntico antes e depois (`C3CCD48C…958C0A`). | ✅ Passou |
| **Migração SQL e políticas RLS** | `supabase/tests/rls.test.mjs` em PostgreSQL real embutido (PGlite): criação de perfil via trigger, bloqueio de elevação de privilégio (`role`/`approved`), visibilidade restrita por aluno e professor, `join_class`, `start_session` (capacidade, cota diária, reconexão), índice único de 1 sessão/aluno e `reap_sessions` para encerramento por inatividade. | ✅ Passou |
| **Portal Next.js (tipos e build)** | `npx tsc --noEmit` (zero erros) e `npm run build` (build de produção limpo, gerando todas as rotas e copiando Ruffle automaticamente). | ✅ Passou |
| **Higiene Git / segredos** | `simulador/`, `portal/sim-assets/`, `portal/public/ruffle/` e `.env*` ignorados no `.gitignore`. | ✅ Passou |

## B. Checklist final após publicar no Supabase + Vercel

| # | Critério | Como verificar |
|---|---|---|
| 1 | Arquivos publicados com proteção | Chamar `https://SEU-PROJETO.vercel.app/api/sim/Simulador.swf` em janela anônima (sem login) → deve retornar **HTTP 401**. |
| 2 | Cadastro, login e bloqueio sem turma | Criar conta de aluno sem informar código da turma → acessar `/simulator` redireciona ao painel; `POST /api/session/start` retorna **403**. |
| 3 | Entrada na turma e abertura do simulador | Informar código da turma no painel → clicar em **Abrir simulador** → **Iniciar simulador** → o Intel Simulator abre na área ampla com tela cheia funcionando. |
| 4 | Mouse, teclado e áudio | Clicar no computador, ler os sintomas (acentos corretos), desligar no botão verde, aplicar procedimentos de hardware/software e conferir alteração na pontuação. |
| 5 | Dois estudantes simultâneos e independentes | Abrir duas contas (Aluno A e Aluno B) em navegadores/perfis diferentes ao mesmo tempo: ações em A não alteram B; o painel `/admin` mostra **2 sessões ativas**. |
| 6 | Reiniciar e encerrar sessão | Clicar em **Reiniciar ambiente** → simulador volta ao início (10.000 pontos) e sessão anterior aparece no histórico como `restart`. Clicar em **Encerrar sessão** → simulador é removido da tela e sessão aparece como `user`. |
| 7 | Encerramento pelo admin e inatividade | No `/admin`, encerrar a sessão de um aluno → em até 30 s a tela do aluno é desconectada automaticamente. Fechar a aba sem clicar em encerrar → após `idle_minutes` (padrão 3 min) a sessão é fechada (`inactive`). |
| 8 | Permissões administrativas | Aluno tentando abrir `/admin` é redirecionado para `/dashboard`; ações do admin aparecem registradas em **Auditoria administrativa**. |
