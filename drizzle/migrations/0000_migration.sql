
create type public.app_role as enum ('admin','user');
create type public.application_status as enum ('submitted','in_review','info_requested','escalated','approved','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_number text not null unique,
  first_name text, last_name text, company text, country text, phone text, email text,
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null, unique(user_id, role)
);
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_number text not null,
  plan_id text not null, plan_name text not null, monthly_fee int not null, monthly_hours int not null,
  status application_status not null default 'submitted',
  assigned_to text,
  signed_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_id uuid, actor_label text not null default 'System',
  action text not null, from_status application_status, to_status application_status, note text,
  created_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  plan_name text not null, monthly_fee int not null, monthly_hours int not null, hours_used numeric not null default 0,
  status text not null default 'pending', started_at timestamptz, renews_at timestamptz, created_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  name text not null, service text not null, status text not null default 'planned', hours numeric not null default 0, due_at date, created_at timestamptz not null default now()
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  number text not null, amount numeric not null, status text not null default 'open', issued_at date not null default current_date, due_at date, created_at timestamptz not null default now()
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  reference text not null, description text not null, amount numeric not null, method text, status text not null default 'completed', created_at timestamptz not null default now()
);
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  subject text not null, priority text not null default 'normal', status text not null default 'open', created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles, public.applications, public.application_events, public.subscriptions, public.projects, public.invoices, public.transactions, public.support_tickets to authenticated;
grant select on public.user_roles to authenticated;
grant all on public.profiles, public.user_roles, public.applications, public.application_events, public.subscriptions, public.projects, public.invoices, public.transactions, public.support_tickets to service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.projects enable row level security;
alter table public.invoices enable row level security;
alter table public.transactions enable row level security;
alter table public.support_tickets enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own or admin profile" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin update profile" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "own or admin apps" on public.applications for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin update apps" on public.applications for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin read events" on public.application_events for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin add events" on public.application_events for insert to authenticated with check (public.has_role(auth.uid(),'admin') and actor_id = auth.uid());

do $$ declare t text; begin
  foreach t in array array['subscriptions','projects','invoices','transactions','support_tickets'] loop
    execute format('create policy "own or admin read" on public.%I for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),''admin''))', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.has_role(auth.uid(),''admin'')) with check (public.has_role(auth.uid(),''admin''))', t);
  end loop;
end $$;

-- new user: profile, and application when signed up via signup flow
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := new.raw_user_meta_data; acct text; app_id uuid;
begin
  acct := coalesce(m->>'account_number', '');
  if acct !~ '^\d{10}$' or exists (select 1 from profiles where account_number = acct) then
    loop
      acct := lpad((floor(random()*9000000000)+1000000000)::bigint::text, 10, '0');
      exit when not exists (select 1 from profiles where account_number = acct);
    end loop;
  end if;
  insert into profiles(id, account_number, first_name, last_name, company, country, phone, email)
  values (new.id, acct, m->>'first_name', m->>'last_name', m->>'company', m->>'country', m->>'phone', new.email);
  if m ? 'plan_id' then
    insert into applications(user_id, account_number, plan_id, plan_name, monthly_fee, monthly_hours, signed_at)
    values (new.id, acct, m->>'plan_id', m->>'plan_name', (m->>'monthly_fee')::int, (m->>'monthly_hours')::int, now())
    returning id into app_id;
    insert into application_events(application_id, actor_label, action, to_status, note)
    values (app_id, 'Applicant', 'Application submitted and digitally signed', 'submitted', 'Plan: ' || (m->>'plan_name'));
    insert into subscriptions(user_id, plan_name, monthly_fee, monthly_hours, status)
    values (new.id, m->>'plan_name', (m->>'monthly_fee')::int, (m->>'monthly_hours')::int, 'pending');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.grant_admin_for_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and lower(split_part(new.email,'@',2)) = 'firstpersonmarketing.com' then
    insert into user_roles(user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created_admin after insert on auth.users for each row execute function public.grant_admin_for_domain();
create trigger on_auth_user_confirmed_admin after update of email_confirmed_at on auth.users for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null) execute function public.grant_admin_for_domain();
