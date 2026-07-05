create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wedding_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wedding_memberships (
  workspace_id uuid not null references public.wedding_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.wedding_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.wedding_workspaces(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (workspace_id, invitee_email)
);

alter table public.profiles enable row level security;
alter table public.wedding_workspaces enable row level security;
alter table public.wedding_memberships enable row level security;
alter table public.wedding_invitations enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
on public.profiles for insert
with check (id = auth.uid());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "workspaces select members" on public.wedding_workspaces;
create policy "workspaces select members"
on public.wedding_workspaces for select
using (
  exists (
    select 1 from public.wedding_memberships m
    where m.workspace_id = id and m.user_id = auth.uid()
  )
);

drop policy if exists "workspaces insert owner" on public.wedding_workspaces;
create policy "workspaces insert owner"
on public.wedding_workspaces for insert
with check (owner_id = auth.uid());

drop policy if exists "workspaces update members" on public.wedding_workspaces;
create policy "workspaces update members"
on public.wedding_workspaces for update
using (
  exists (
    select 1 from public.wedding_memberships m
    where m.workspace_id = id and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.wedding_memberships m
    where m.workspace_id = id and m.user_id = auth.uid()
  )
);

drop policy if exists "memberships select members" on public.wedding_memberships;
create policy "memberships select members"
on public.wedding_memberships for select
using (user_id = auth.uid());

drop policy if exists "memberships insert owner self" on public.wedding_memberships;
create policy "memberships insert owner self"
on public.wedding_memberships for insert
with check (
  user_id = auth.uid()
  and role = 'owner'
  and exists (
    select 1 from public.wedding_workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  )
);

drop policy if exists "memberships insert invited self" on public.wedding_memberships;
create policy "memberships insert invited self"
on public.wedding_memberships for insert
with check (
  user_id = auth.uid()
  and role = 'member'
  and exists (
    select 1 from public.wedding_invitations i
    where i.workspace_id = workspace_id
    and i.invitee_email = lower(auth.jwt() ->> 'email')
    and i.status = 'pending'
  )
);

drop policy if exists "invitations select related" on public.wedding_invitations;
create policy "invitations select related"
on public.wedding_invitations for select
using (
  invitee_email = lower(auth.jwt() ->> 'email')
  or exists (
    select 1 from public.wedding_memberships m
    where m.workspace_id = wedding_invitations.workspace_id
    and m.user_id = auth.uid()
  )
);

drop policy if exists "invitations insert members" on public.wedding_invitations;
create policy "invitations insert members"
on public.wedding_invitations for insert
with check (
  inviter_id = auth.uid()
  and invitee_email = lower(invitee_email)
  and exists (
    select 1 from public.wedding_memberships m
    where m.workspace_id = workspace_id
    and m.user_id = auth.uid()
  )
);

drop policy if exists "invitations update invitee" on public.wedding_invitations;
create policy "invitations update invitee"
on public.wedding_invitations for update
using (invitee_email = lower(auth.jwt() ->> 'email'))
with check (invitee_email = lower(auth.jwt() ->> 'email'));
