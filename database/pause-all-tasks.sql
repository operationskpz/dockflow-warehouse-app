-- Bulk pause is available only to approved warehouse managers.
create or replace function public.dockflow_pause_all_tasks()
returns integer language plpgsql security invoker set search_path='' as $$
declare moment timestamptz:=clock_timestamp(); changed integer;
begin
 if not exists(select 1 from public.dockflow_members where user_id=(select auth.uid()) and role='manager') then raise exception 'Admin access required' using errcode='42501'; end if;
 update public.dockflow_tasks set paused_at=moment
 where started_at is not null and finished_at is null and paused_at is null and status<>'Done';
 get diagnostics changed=row_count;
 return changed;
end;
$$;
revoke all on function public.dockflow_pause_all_tasks() from public,anon;
grant execute on function public.dockflow_pause_all_tasks() to authenticated;
