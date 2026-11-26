-- =====================================================================
-- Intel Simulator Online - esquema inicial (Supabase / PostgreSQL)
-- Execute no SQL Editor do Supabase ou via `supabase db push`.
-- Princípios: RLS em todas as tabelas; clientes (browser) só LEEM;
-- toda escrita sensível passa por funções SECURITY DEFINER ou pela
-- service_role (usada somente no servidor: Vercel server code / orquestrador).
-- =====================================================================

create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.session_status as enum ('starting', 'active', 'ended', 'failed');

-- ---------------------------------------------------------------- tabelas
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        public.user_role not null default 'student',
  approved    boolean not null default false,  -- só usa o simulador após entrar numa turma / ser aprovado
  active      boolean not null default true,   -- admin pode bloquear
  created_at  timestamptz not null default now()
);

create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  join_code   text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  owner_id    uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create table public.class_members (
  class_id    uuid not null references public.classes(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  class_id        uuid references public.classes(id) on delete set null,
  status          public.session_status not null default 'starting',
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_heartbeat  timestamptz not null default now(),
  ended_at        timestamptz,
  end_reason      text,            -- user | restart | expired | inactive | admin
  client_ip       text,
  user_agent      text
);
-- no máximo UMA sessão aberta por estudante (evita compartilhamento/duplicidade)
create unique index sessions_one_open_per_user
  on public.sessions (user_id) where status in ('starting', 'active');
create index sessions_status_idx on public.sessions (status);
create index sessions_user_started_idx on public.sessions (user_id, started_at desc);

create table public.access_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  session_id  uuid references public.sessions(id) on delete set null,
  event       text not null,       -- login | login_failed | logout | session_start | session_reconnect | session_end ...
  ip          text,
  user_agent  text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index access_log_user_idx on public.access_log (user_id, created_at desc);

create table public.admin_audit (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create table public.settings (
  key    text primary key,
  value  jsonb not null
);
insert into public.settings (key, value) values
  ('max_concurrent_sessions', '200'),  -- limite lógico (o simulador roda no navegador; não há servidor a proteger)
  ('max_session_minutes',     '90'),   -- duração máxima de uma sessão
  ('daily_limit_minutes',     '240'),  -- cota diária por estudante
  ('idle_minutes',            '3');    -- sem batimento do navegador por este tempo = sessão encerrada

-- ---------------------------------------------------- funções auxiliares
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'admin') and active);
$$;

create or replace function public.owns_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = p_class and owner_id = auth.uid());
$$;

create or replace function public.is_member(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_members where class_id = p_class and user_id = auth.uid());
$$;

create or replace function public.is_teacher_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_members cm join classes c on c.id = cm.class_id
    where cm.user_id = p_user and c.owner_id = auth.uid()
  );
$$;

-- cria o perfil automaticamente no cadastro (sempre como student, não aprovado)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- estudante entra numa turma pelo código e é aprovado automaticamente
create or replace function public.join_class(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into v_class from classes where join_code = upper(trim(p_code));
  if v_class is null then raise exception 'invalid_code'; end if;
  insert into class_members (class_id, user_id) values (v_class, auth.uid()) on conflict do nothing;
  update profiles set approved = true where id = auth.uid() and active;
  return v_class;
end;
$$;

-- Encerra sessões expiradas ou sem batimento (chamada SOMENTE pelo servidor com service_role).
create or replace function public.reap_sessions() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_idle int;
  v_count int;
begin
  select coalesce((select (value #>> '{}')::int from settings where key = 'idle_minutes'), 3) into v_idle;
  update sessions
     set status = 'ended',
         ended_at = now(),
         end_reason = case when sessions.expires_at <= now() then 'expired' else 'inactive' end
   where sessions.status in ('starting', 'active')
     and (sessions.expires_at <= now()
          or sessions.last_heartbeat < now() - make_interval(mins => v_idle));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Reserva atômica de uma sessão (chamada SOMENTE pelo servidor com service_role).
-- Valida aprovação, sessão aberta existente, capacidade global e cota diária.
create or replace function public.start_session(p_user uuid)
returns table (o_session_id uuid, o_created boolean, o_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_existing sessions;
  v_cap int; v_max int; v_daily int; v_used numeric; v_open int; v_class uuid; v_new sessions;
begin
  perform pg_advisory_xact_lock(hashtext('intelsim_start_session'));
  perform public.reap_sessions();

  select * into v_profile from profiles where id = p_user;
  if not found or not v_profile.active or not v_profile.approved then
    raise exception 'not_approved';
  end if;

  select * into v_existing from sessions
   where sessions.user_id = p_user and sessions.status in ('starting', 'active')
   order by started_at desc limit 1;
  if found then
    update sessions set last_heartbeat = now() where id = v_existing.id;
    return query select v_existing.id, false, v_existing.expires_at;
    return;
  end if;

  select coalesce((select (value #>> '{}')::int from settings where key = 'max_concurrent_sessions'), 200) into v_cap;
  select coalesce((select (value #>> '{}')::int from settings where key = 'max_session_minutes'), 90) into v_max;
  select coalesce((select (value #>> '{}')::int from settings where key = 'daily_limit_minutes'), 240) into v_daily;

  select count(*) into v_open from sessions where sessions.status in ('starting', 'active');
  if v_open >= v_cap then raise exception 'capacity'; end if;

  select coalesce(sum(extract(epoch from (least(coalesce(ended_at, now()), now()) - started_at)) / 60), 0)
    into v_used from sessions
   where sessions.user_id = p_user and started_at >= date_trunc('day', now());
  if v_used >= v_daily then raise exception 'quota'; end if;

  select class_id into v_class from class_members where user_id = p_user order by joined_at limit 1;

  insert into sessions (user_id, class_id, status, expires_at, last_heartbeat)
  values (p_user, v_class, 'active', now() + make_interval(mins => v_max), now())
  returning * into v_new;

  return query select v_new.id, true, v_new.expires_at;
end;
$$;

-- ------------------------------------------------------------- permissões
revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.is_admin(), public.is_staff(), public.owns_class(uuid),
  public.is_member(uuid), public.is_teacher_of(uuid), public.handle_new_user(),
  public.join_class(text), public.reap_sessions(), public.start_session(uuid) from public, anon, authenticated;

grant select on public.profiles, public.classes, public.class_members,
                public.sessions, public.access_log, public.admin_audit, public.settings
  to authenticated;
grant update (full_name) on public.profiles to authenticated;   -- NUNCA role/approved/active
grant insert, update, delete on public.classes to authenticated;
grant delete on public.class_members to authenticated;

grant execute on function public.is_admin(), public.is_staff(), public.owns_class(uuid),
                          public.is_member(uuid), public.is_teacher_of(uuid),
                          public.join_class(text) to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.reap_sessions(), public.start_session(uuid) to service_role;

-- -------------------------------------------------------------------- RLS
alter table public.profiles       enable row level security;
alter table public.classes        enable row level security;
alter table public.class_members  enable row level security;
alter table public.sessions       enable row level security;
alter table public.access_log     enable row level security;
alter table public.admin_audit    enable row level security;
alter table public.settings       enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_teacher_of(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy classes_select on public.classes for select to authenticated
  using (owner_id = auth.uid() or public.is_admin() or public.is_member(id));
create policy classes_insert on public.classes for insert to authenticated
  with check (owner_id = auth.uid() and public.is_staff());
create policy classes_update on public.classes for update to authenticated
  using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy classes_delete on public.classes for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

create policy members_select on public.class_members for select to authenticated
  using (user_id = auth.uid() or public.owns_class(class_id) or public.is_admin());
create policy members_delete on public.class_members for delete to authenticated
  using (public.owns_class(class_id) or public.is_admin());

create policy sessions_select on public.sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_teacher_of(user_id));

create policy access_log_select on public.access_log for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_teacher_of(user_id));

create policy admin_audit_select on public.admin_audit for select to authenticated
  using (public.is_admin());

create policy settings_select on public.settings for select to authenticated using (true);

-- Primeiro administrador (execute UMA vez, com o e-mail correto, depois do cadastro):
--   update public.profiles set role = 'admin', approved = true where email = 'seu@email.com';
