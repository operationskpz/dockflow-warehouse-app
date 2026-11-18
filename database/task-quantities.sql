-- Optional task quantities, shared progress, and atomic completion increments.
alter table public.dockflow_tasks
 add column target_quantity integer,
 add column quantity_unit text not null default 'pallets' check(quantity_unit in ('pallets','boxes','units')),
 add column completed_quantity integer not null default 0,
 add constraint dockflow_task_quantity_valid check((target_quantity is null and completed_quantity=0) or (target_quantity is not null and target_quantity between 1 and 1000000 and completed_quantity between 0 and target_quantity));
create or replace function public.dockflow_complete_quantity(task_id text,amount integer default 1)
returns public.dockflow_tasks language plpgsql security invoker set search_path='' as $$
declare item public.dockflow_tasks;
begin
 if not exists(select 1 from public.dockflow_members where user_id=(select auth.uid())) then raise exception 'Warehouse access required' using errcode='42501';end if;
 select * into item from public.dockflow_tasks where id=task_id for update;
 if not found then raise exception 'Task not found';end if;
 if item.started_at is null or item.paused_at is not null or item.finished_at is not null or item.status='Done' then raise exception 'Start or resume the task before recording progress';end if;
 if amount is null or amount<1 or item.target_quantity is null or item.completed_quantity+amount>item.target_quantity then raise exception 'Quantity exceeds the remaining amount';end if;
 update public.dockflow_tasks set completed_quantity=completed_quantity+amount where id=task_id returning * into item;
 return item;
end;
$$;
revoke all on function public.dockflow_complete_quantity(text,integer) from public,anon;
grant execute on function public.dockflow_complete_quantity(text,integer) to authenticated;
