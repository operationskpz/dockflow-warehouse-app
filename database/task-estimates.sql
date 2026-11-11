alter table public.dockflow_tasks add column if not exists estimated_minutes integer check(estimated_minutes between 1 and 525600);
alter table public.dockflow_repeated_tasks add column if not exists estimated_minutes integer check(estimated_minutes between 1 and 525600);
create or replace function public.dockflow_generate_repeated_tasks() returns integer language plpgsql security invoker set search_path='' as $$
declare rule public.dockflow_repeated_tasks;occurs date;cutoff date;steps integer;inserted integer;total integer:=0;
begin
 if current_user<>'postgres' and not exists(select 1 from public.dockflow_members m where m.user_id=(select auth.uid()) and m.role='manager') then raise exception 'Manager access required' using errcode='42501';end if;
 for rule in select * from public.dockflow_repeated_tasks r where r.enabled and r.next_run_date<=(now() at time zone r.time_zone)::date and (r.ends_on is null or r.next_run_date<=r.ends_on) for update skip locked loop
  occurs:=rule.next_run_date;cutoff:=(now() at time zone rule.time_zone)::date;steps:=0;
  while occurs<=cutoff and (rule.ends_on is null or occurs<=rule.ends_on) and steps<366 loop
   insert into public.dockflow_tasks(id,title,description,category,priority,estimated_minutes,assignees,assignee,status,due,repeated_rule_id,repeated_for)
   values('repeat:'||rule.id::text||':'||to_char(occurs,'YYYY-MM-DD'),rule.title,rule.description,rule.category,rule.priority,rule.estimated_minutes,rule.assignees,coalesce(rule.assignees[1],''),'To Do',to_char(occurs,'YYYY-MM-DD'),rule.id,occurs)
   on conflict do nothing;
   get diagnostics inserted=row_count;total:=total+inserted;
   occurs:=public.dockflow_next_repeat_date(rule.starts_on,rule.frequency,occurs+1);steps:=steps+1;
  end loop;
  update public.dockflow_repeated_tasks set next_run_date=occurs where id=rule.id;
 end loop;
 return total;
end $$;
