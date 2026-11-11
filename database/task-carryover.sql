alter table public.dockflow_tasks add column if not exists original_due text, add column if not exists carried_over_at timestamptz, add column if not exists carryover_count integer not null default 0 check(carryover_count>=0);
create or replace function public.dockflow_carried_due_date(task_due text,task_status text,completed_at timestamptz,as_of_date date) returns text language sql stable security invoker set search_path='' as $$
 select case when task_status<>'Done' and completed_at is null and task_due ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_catalog.pg_input_is_valid(task_due,'date') and task_due<to_char(as_of_date,'YYYY-MM-DD') then to_char(as_of_date,'YYYY-MM-DD') else task_due end;
$$;
revoke all on function public.dockflow_carried_due_date(text,text,timestamptz,date) from public,anon;
grant execute on function public.dockflow_carried_due_date(text,text,timestamptz,date) to authenticated;
create or replace function public.dockflow_rollover_unfinished_tasks() returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if current_user<>'postgres' and not exists(select 1 from public.dockflow_members where user_id=(select auth.uid())) then raise exception 'Warehouse access required' using errcode='42501';end if;
 update public.dockflow_tasks t set
  original_due=coalesce(t.original_due,t.due),
  due=public.dockflow_carried_due_date(t.due,t.status,t.finished_at,(now() at time zone coalesce((select r.time_zone from public.dockflow_repeated_tasks r where r.id=t.repeated_rule_id),'America/New_York'))::date),
  carried_over_at=clock_timestamp(),carryover_count=t.carryover_count+1
 where t.status<>'Done' and t.finished_at is null and t.due<>'' and
 t.due is distinct from public.dockflow_carried_due_date(t.due,t.status,t.finished_at,(now() at time zone coalesce((select r.time_zone from public.dockflow_repeated_tasks r where r.id=t.repeated_rule_id),'America/New_York'))::date);
 get diagnostics affected=row_count;return affected;
end $$;
revoke all on function public.dockflow_rollover_unfinished_tasks() from public,anon;
grant execute on function public.dockflow_rollover_unfinished_tasks() to authenticated;
create or replace function public.dockflow_scheduled_maintenance() returns jsonb language plpgsql security invoker set search_path='' as $$
declare generated integer;carried integer;
begin
 generated:=public.dockflow_generate_repeated_tasks();
 carried:=public.dockflow_rollover_unfinished_tasks();
 return jsonb_build_object('generated',generated,'carried_over',carried);
end $$;
revoke all on function public.dockflow_scheduled_maintenance() from public,anon,authenticated;
select cron.schedule('dockflow-repeated-tasks','*/5 * * * *','select public.dockflow_scheduled_maintenance();');
