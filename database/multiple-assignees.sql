alter table public.dockflow_tasks add column if not exists assignees text[];
create or replace function public.dockflow_sync_assignees() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP='UPDATE' then
  if new.assignees is not distinct from old.assignees and new.assignee is distinct from old.assignee then
   new.assignees := case when coalesce(new.assignee,'')='' then array[]::text[] else array[new.assignee] end;
  end if;
 end if;
 if new.assignees is null then
  new.assignees := case when coalesce(new.assignee,'')='' then array[]::text[] else array[new.assignee] end;
 end if;
 new.assignee := coalesce(new.assignees[1],'');
 return new;
end $$;
revoke all on function public.dockflow_sync_assignees() from public,anon,authenticated;
create trigger dockflow_sync_assignees before insert or update on public.dockflow_tasks for each row execute function public.dockflow_sync_assignees();
