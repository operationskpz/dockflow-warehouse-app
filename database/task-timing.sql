alter table public.dockflow_tasks add column if not exists started_at timestamptz, add column if not exists finished_at timestamptz;
create or replace function public.dockflow_status_timing() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is distinct from old.status then
  if new.status='In Progress' then
   new.started_at:=case when old.finished_at is not null then clock_timestamp() else coalesce(old.started_at,clock_timestamp()) end;
   new.finished_at:=null;
  elsif new.status='Done' and old.started_at is not null then
   new.started_at:=old.started_at;
   new.finished_at:=coalesce(old.finished_at,clock_timestamp());
  elsif old.finished_at is not null then
   new.started_at:=null;new.finished_at:=null;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.dockflow_status_timing() from public,anon,authenticated;
create trigger dockflow_status_timing before update of status on public.dockflow_tasks for each row execute function public.dockflow_status_timing();
create or replace function public.dockflow_task_action(task_id text, action text) returns public.dockflow_tasks language plpgsql security invoker set search_path='' as $$
declare item public.dockflow_tasks;
begin
 if not exists(select 1 from public.dockflow_members where user_id=(select auth.uid())) then raise exception 'Warehouse access required' using errcode='42501';end if;
 select * into item from public.dockflow_tasks where id=task_id for update;
 if not found then raise exception 'Task not found';end if;
 if action='start' then
  if item.finished_at is not null or item.status='Done' then raise exception 'Task is already finished';end if;
  if item.started_at is null then
   update public.dockflow_tasks set started_at=clock_timestamp(),finished_at=null,status='In Progress' where id=task_id returning * into item;
  end if;
 elsif action='finish' then
  if item.finished_at is not null then return item;end if;
  if item.started_at is null then raise exception 'Start the task first';end if;
  update public.dockflow_tasks set finished_at=clock_timestamp(),status='Done' where id=task_id returning * into item;
 else raise exception 'Unknown task action';end if;
 return item;
end $$;
revoke all on function public.dockflow_task_action(text,text) from public,anon;
grant execute on function public.dockflow_task_action(text,text) to authenticated;
