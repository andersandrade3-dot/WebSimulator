-- Correção pontual para projetos que já executaram 0001_init.sql antes desta atualização:
-- Garante que a chave service_role / sb_secret_ tenha permissão de leitura e escrita
-- nas tabelas e sequências do schema public (usada apenas no servidor).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.reap_sessions(), public.start_session(uuid) to service_role;
