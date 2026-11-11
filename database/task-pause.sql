alter table public.dockflow_tasks add column if not exists paused_at timestamptz, add column if not exists total_pause_seconds double precision not null default 0 check(total_pause_seconds>=0);
create or replace function public.dockflow_status_timing() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is distinct from old.status then
  if new.status='In Progress' then
   new.started_at:=case when old.finished_at is not null then clock_timestamp() else coalesce(old.started_at,clock_timestamp()) end;
   new.finished_at:=null;
   if old.finished_at is not null then new.paused_at:=null;new.total_pause_seconds:=0;end if;
  elsif new.status='Done' and old.started_at is not null then
   new.started_at:=old.started_at;new.finished_at:=coalesce(old.finished_at,new.finished_at,clock_timestamp());
   new.total_pause_seconds:=old.total_pause_seconds+case when old.paused_at is not null then greatest(0,extract(epoch from(new.finished_at-old.paused_at))) else 0 end;new.paused_at:=null;
  elsif old.finished_at is not null then
   new.started_at:=null;new.finished_at:=null;new.paused_at:=null;new.total_pause_seconds:=0;
  end if;
 end if;return new;
end $$;
create or replace function public.dockflow_task_action(task_id text, action text) returns public.dockflow_tasks language plpgsql security invoker set search_path='' as $$
declare item public.dockflow_tasks; moment timestamptz;
begin
 if not exists(select 1 from public.dockflow_members where user_id=(select auth.uid())) then raise exception 'Warehouse access required' using errcode='42501';end if;
 select * into item from public.dockflow_tasks where id=task_id for update;
 if not found then raise exception 'Task not found';end if;
 moment:=clock_timestamp();
 if action='start' then
  if item.finished_at is not null or item.status='Done' then raise exception 'Task is already finished';end if;
  if item.started_at is null then update public.dockflow_tasks set started_at=moment,finished_at=null,paused_at=null,total_pause_seconds=0,status='In Progress' where id=task_id returning * into item;end if;
 elsif action in ('pause','resume') then
  if item.started_at is null then raise exception 'Start the task first';end if;
  if item.finished_at is not null or item.status='Done' then raise exception 'Task is already finished';end if;
  if action='pause' and item.paused_at is null then update public.dockflow_tasks set paused_at=moment where id=task_id returning * into item;
  elsif action='resume' and item.paused_at is not null then update public.dockflow_tasks set total_pause_seconds=total_pause_seconds+greatest(0,extract(epoch from(moment-paused_at))),paused_at=null where id=task_id returning * into item;end if;
 elsif action='finish' then
  if item.finished_at is not null then return item;end if;
  if item.started_at is null then raise exception 'Start the task first';end if;
  update public.dockflow_tasks set finished_at=moment,total_pause_seconds=total_pause_seconds+case when paused_at is not null then greatest(0,extract(epoch from(moment-paused_at))) else 0 end,paused_at=null,status='Done' where id=task_id returning * into item;
 else raise exception 'Unknown task action';end if;return item;
end $$;
revoke all on function public.dockflow_status_timing() from public,anon,authenticated;
revoke all on function public.dockflow_task_action(text,text) from public,anon;
grant execute on function public.dockflow_task_action(text,text) to authenticated;
