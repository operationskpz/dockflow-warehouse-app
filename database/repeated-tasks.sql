create extension if not exists pg_cron with schema pg_catalog;
create table public.dockflow_repeated_tasks (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 1 and 120),
 description text not null default '',
 category text not null default 'General' check(category in ('Receiving','Shipping','FBA','Inventory','General')),
 priority text not null default 'Medium' check(priority in ('Low','Medium','High')),
 assignees text[] not null default array[]::text[],
 frequency text not null check(frequency in ('daily','weekdays','weekly','monthly')),
 starts_on date not null,ends_on date, time_zone text not null default 'America/New_York',
 enabled boolean not null default true,next_run_date date not null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 check(ends_on is null or ends_on>=starts_on)
);
alter table public.dockflow_repeated_tasks enable row level security;
revoke all on public.dockflow_repeated_tasks from public,anon,authenticated;
grant select,insert,update,delete on public.dockflow_repeated_tasks to authenticated;
create policy "DockFlow members read repeated tasks" on public.dockflow_repeated_tasks for select to authenticated using (exists(select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
create policy "DockFlow managers manage repeated tasks" on public.dockflow_repeated_tasks for all to authenticated using(exists(select 1 from public.dockflow_members m where m.user_id=(select auth.uid()) and m.role='manager')) with check(exists(select 1 from public.dockflow_members m where m.user_id=(select auth.uid()) and m.role='manager'));
create index dockflow_repeated_due_idx on public.dockflow_repeated_tasks(next_run_date) where enabled;
alter table public.dockflow_tasks add column repeated_rule_id uuid references public.dockflow_repeated_tasks(id) on delete set null, add column repeated_for date;
create unique index dockflow_repeated_instance_idx on public.dockflow_tasks(repeated_rule_id,repeated_for) where repeated_rule_id is not null;
create or replace function public.dockflow_next_repeat_date(anchor date, cadence text, not_before date) returns date language plpgsql immutable security invoker set search_path='' as $$
declare target date:=greatest(anchor,not_before);month_start date;candidate date;last_day integer;
begin
 if cadence='daily' then return target;
 elsif cadence='weekdays' then
  if extract(isodow from target)=6 then return target+2;elsif extract(isodow from target)=7 then return target+1;else return target;end if;
 elsif cadence='weekly' then return anchor+(((target-anchor+6)/7)*7);
 elsif cadence='monthly' then
  month_start:=date_trunc('month',target)::date;
  last_day:=extract(day from(month_start+interval '1 month - 1 day'))::integer;
  candidate:=month_start+(least(extract(day from anchor)::integer,last_day)-1);
  if candidate<target then
   month_start:=(month_start+interval '1 month')::date;
   last_day:=extract(day from(month_start+interval '1 month - 1 day'))::integer;
   candidate:=month_start+(least(extract(day from anchor)::integer,last_day)-1);
  end if;return candidate;
 else raise exception 'Invalid repeat frequency';end if;
end $$;
revoke all on function public.dockflow_next_repeat_date(date,text,date) from public,anon;
grant execute on function public.dockflow_next_repeat_date(date,text,date) to authenticated;
create or replace function public.dockflow_prepare_repeat() returns trigger language plpgsql security invoker set search_path='' as $$
declare reset_cursor boolean;
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then raise exception 'Invalid schedule timezone';end if;
 reset_cursor:=TG_OP='INSERT';
 if TG_OP='UPDATE' then reset_cursor:=row(new.starts_on,new.frequency,new.time_zone,new.ends_on) is distinct from row(old.starts_on,old.frequency,old.time_zone,old.ends_on) or (new.enabled and not old.enabled);end if;
 if reset_cursor then new.next_run_date:=public.dockflow_next_repeat_date(new.starts_on,new.frequency,greatest(new.starts_on,(now() at time zone new.time_zone)::date));end if;
 if TG_OP='INSERT' then new.created_by:=auth.uid();end if;
 return new;
end $$;
revoke all on function public.dockflow_prepare_repeat() from public,anon,authenticated;
create trigger dockflow_prepare_repeat before insert or update on public.dockflow_repeated_tasks for each row execute function public.dockflow_prepare_repeat();
create or replace function public.dockflow_generate_repeated_tasks() returns integer language plpgsql security invoker set search_path='' as $$
declare rule public.dockflow_repeated_tasks;occurs date;cutoff date;steps integer;inserted integer;total integer:=0;
begin
 if current_user<>'postgres' and not exists(select 1 from public.dockflow_members m where m.user_id=(select auth.uid()) and m.role='manager') then raise exception 'Manager access required' using errcode='42501';end if;
 for rule in select * from public.dockflow_repeated_tasks r where r.enabled and r.next_run_date<=(now() at time zone r.time_zone)::date and (r.ends_on is null or r.next_run_date<=r.ends_on) for update skip locked loop
  occurs:=rule.next_run_date;cutoff:=(now() at time zone rule.time_zone)::date;steps:=0;
  while occurs<=cutoff and (rule.ends_on is null or occurs<=rule.ends_on) and steps<366 loop
   insert into public.dockflow_tasks(id,title,description,category,priority,assignees,assignee,status,due,repeated_rule_id,repeated_for)
   values('repeat:'||rule.id::text||':'||to_char(occurs,'YYYY-MM-DD'),rule.title,rule.description,rule.category,rule.priority,rule.assignees,coalesce(rule.assignees[1],''),'To Do',to_char(occurs,'YYYY-MM-DD'),rule.id,occurs)
   on conflict do nothing;
   get diagnostics inserted=row_count;total:=total+inserted;
   occurs:=public.dockflow_next_repeat_date(rule.starts_on,rule.frequency,occurs+1);steps:=steps+1;
  end loop;
  update public.dockflow_repeated_tasks set next_run_date=occurs where id=rule.id;
 end loop;
 return total;
end $$;
revoke all on function public.dockflow_generate_repeated_tasks() from public,anon;
grant execute on function public.dockflow_generate_repeated_tasks() to authenticated;
select cron.schedule('dockflow-repeated-tasks','*/5 * * * *','select public.dockflow_generate_repeated_tasks();');
