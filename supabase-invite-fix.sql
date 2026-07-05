create or replace function public.accept_workspace_invitation(invitation_id uuid)
returns public.wedding_workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  p_invitation_id alias for invitation_id;
  target_invitation public.wedding_invitations;
  target_workspace public.wedding_workspaces;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_invitation
  from public.wedding_invitations
  where id = p_invitation_id
    and invitee_email = lower(auth.jwt() ->> 'email')
    and status = 'pending';

  if not found then
    raise exception 'invitation not found';
  end if;

  insert into public.wedding_memberships (workspace_id, user_id, role)
  values (target_invitation.workspace_id, auth.uid(), 'member')
  on conflict (workspace_id, user_id) do nothing;

  update public.wedding_invitations
  set status = 'accepted',
      responded_at = now()
  where id = target_invitation.id;

  select *
  into target_workspace
  from public.wedding_workspaces
  where id = target_invitation.workspace_id;

  return target_workspace;
end;
$$;

grant execute on function public.accept_workspace_invitation(uuid) to authenticated;

create or replace function public.get_workspace_members(workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  p_workspace_id alias for workspace_id;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.wedding_memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'not a workspace member';
  end if;

  return query
  select
    m.user_id,
    p.email,
    p.display_name,
    m.role
  from public.wedding_memberships m
  left join public.profiles p on p.id = m.user_id
  where m.workspace_id = p_workspace_id
  order by case when m.role = 'owner' then 0 else 1 end, m.created_at asc;
end;
$$;

grant execute on function public.get_workspace_members(uuid) to authenticated;
