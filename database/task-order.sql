-- Shared order is independent for each worker; existing RLS remains in force.
alter table public.dockflow_tasks add column if not exists worker_order jsonb not null default '{}'::jsonb;
create or replace function public.dockflow_reorder_tasks(ordered_task_ids text[],worker_key text)
returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer; expected integer;
begin
 if not exists(select 1 from public.dockflow_members where user_id=(select auth.uid())) then raise exception 'Warehouse access required' using errcode='42501'; end if;
 expected:=cardinality(ordered_task_ids);
 if worker_key is null or expected is null or expected<1 or expected>1000 or expected<>(select count(distinct id) from unnest(ordered_task_ids) id) then raise exception 'Invalid task order'; end if;
 if worker_key<>'' and not exists(select 1 from public.dockflow_employees where id=worker_key) then raise exception 'Worker is no longer available'; end if;
 update public.dockflow_tasks t set worker_order=jsonb_set(t.worker_order,array[worker_key],to_jsonb(r.position),true)
 from unnest(ordered_task_ids) with ordinality as r(id,position)
 where t.id=r.id and (case when worker_key<>'' then worker_key=any(t.assignees) else not exists(select 1 from public.dockflow_employees e where e.id=any(t.assignees)) end);
 get diagnostics changed=row_count;
 if changed<>expected then raise exception 'Task assignments changed. Refresh and try again.'; end if;
 return changed;
end;
$$;
revoke all on function public.dockflow_reorder_tasks(text[],text) from public,anon;
grant execute on function public.dockflow_reorder_tasks(text[],text) to authenticated;
