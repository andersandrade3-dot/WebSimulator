# Guia de publicação 100% gratuito (Supabase + Vercel + GitHub)

Custo total: **R\$ 0/mês** (sem VPS, sem cartão de crédito e sem domínio pago — a Vercel fornece HTTPS grátis em `seu-projeto.vercel.app`). Tempo estimado: **15 a 20 minutos**.

## 0. Contas gratuitas necessárias

1. **GitHub** (conta gratuita, crie um repositório **privado**).
2. **Supabase** (plano *Free* — 500 MB de banco + 1 GB de Storage + 5 GB/mês de tráfego).
3. **Vercel** (plano *Hobby* — gratuito para projetos educacionais/pessoais, HTTPS automático).

## 1. Configurar o Supabase (5 min)

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No menu **SQL Editor**, abra uma nova consulta, cole todo o conteúdo de `supabase/migrations/0001_init.sql` e clique em **Run**.
3. Em **Settings → API Keys**, copie:
   - `Project URL` (em *Data API* ou *General*) → `NEXT_PUBLIC_SUPABASE_URL`
   - `Publishable key` (`sb_publishable_...` ou `anon` legada) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `Secret key` (`sb_secret_...` ou `service_role` legada) → `SUPABASE_SERVICE_ROLE_KEY` *(nunca exponha no navegador nem envie ao GitHub)*

## 2. Enviar os arquivos originais do simulador para o bucket privado (2 min)

Este passo extrai o `Simulador.swf` (sem alterar o `Simulador.exe`) e envia o SWF, os XMLs e as imagens para um **bucket privado** no Supabase Storage, evitando que qualquer arquivo original vá para o GitHub:

```powershell
cd portal
copy .env.example .env.local
# Edite portal\.env.local e preencha as 3 chaves do Supabase obtidas no passo 1

npm install
npm run sim:upload
```

Você verá:
```
[sim:upload] Bucket privado "simulator-assets" criado no Supabase Storage.
[sim:upload] Concluído: 49 arquivos enviados para o bucket privado "simulator-assets".
```

> **Teste local opcional antes de publicar:** rode `npm run dev` dentro de `portal/` e abra `http://localhost:3000`. Localmente o portal usa `portal/sim-assets/` direto do disco (já extraído pelo `npm run sim:upload`).

## 3. Subir o código no GitHub (repositório privado)

```powershell
# Na raiz do projeto (WebSimulator):
git status
# Confirme que simulador/, portal/sim-assets/, portal/public/ruffle/ e .env.local NÃO aparecem
git commit -m "Intel Simulator Online - portal gratuito (Vercel + Supabase + Ruffle)"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/intel-simulator-online.git
git push -u origin main
```

## 4. Publicar na Vercel (5 min)

1. Acesse [vercel.com](https://vercel.com) → **Add New Project** → importe seu repositório privado do GitHub.
2. Em **Root Directory**, clique em *Edit* e selecione **`portal`**.
3. Em **Environment Variables**, cadastre:

| Variável | Valor | Marcar *Sensitive*? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | não |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon` | não |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` | **sim** |

4. Clique em **Deploy**. O build copia automaticamente o Ruffle para `public/ruffle/` e publica o portal com HTTPS em `https://SEU-PROJETO.vercel.app`.

## 5. Finalizar URL e criar o primeiro administrador (3 min)

1. No **Supabase → Authentication → URL Configuration**:
   - **Site URL**: `https://SEU-PROJETO.vercel.app` (ou seu domínio personalizado, se quiser conectar um depois).
   - **Redirect URLs**: adicione `https://SEU-PROJETO.vercel.app/**`.
2. Abra o portal no navegador, clique em **Criar conta** e cadastre seu e-mail de professor/administrador (confirme o e-mail enviado pelo Supabase).
3. No **Supabase → SQL Editor**, promova sua conta a administrador (substitua pelo seu e-mail):
   ```sql
   update public.profiles
      set role = 'admin', approved = true
    where email = 'seu@email.com';
   ```
4. Entre no portal → **Painel** → crie uma turma (será gerado um **código da turma**, ex.: `A1B2C3D4`) → entregue esse código aos estudantes.
5. Pronto! Cada estudante cria sua conta, informa o código da turma no painel e já pode abrir o simulador no navegador.

## 6. Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| "Não foi possível carregar os arquivos do simulador" | Verifique se executou `npm run sim:upload` e se `SUPABASE_SERVICE_ROLE_KEY` está configurada na Vercel. Confira o bucket `simulator-assets` em *Supabase → Storage*. |
| E-mail de confirmação não chega no cadastro | No plano gratuito do Supabase, há limite de envios por hora pelo SMTP padrão. Para uso em sala de aula, você pode desativar temporariamente *Confirm email* em *Authentication → Providers → Email* (o acesso continua restrito pelo **código da turma**). |
| Conta diz "não foi liberada" | O estudante precisa inserir o código da turma no painel, ou um administrador pode clicar em **Não → Sim** na coluna *Liberado* em `/admin`. |
| Sessão aparece como ativa mesmo após fechar a aba | Após `idle_minutes` (padrão: 3 min) sem batimento do navegador, a sessão é encerrada automaticamente (`inactive`). |
