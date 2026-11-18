-- Restart an existing task, preserving its definition and discussion.
create or replace function public.dockflow_restart_task(task_id text)
returns public.dockflow_tasks language plpgsql security invoker set search_path='' as $$
declare item public.dockflow_tasks; reset_lines jsonb;
begin
 if not exists(select 1 from public.dockflow_members where user_id=(select auth.uid()) and role='manager') then raise exception 'Admin access required' using errcode='42501';end if;
 select * into item from public.dockflow_tasks where id=task_id for update;
 if not found then raise exception 'Task not found';end if;
 select coalesce(jsonb_agg(jsonb_set(value,'{completed_quantity}','0'::jsonb) order by ordinality),'[]'::jsonb) into reset_lines from jsonb_array_elements(item.quantity_lines) with ordinality;
 update public.dockflow_tasks set status='To Do',started_at=null,finished_at=null,paused_at=null,total_pause_seconds=0,completed_quantity=0,quantity_lines=reset_lines
 where id=task_id returning * into item;
 return item;
end;
$$;
revoke all on function public.dockflow_restart_task(text) from public,anon;
grant execute on function public.dockflow_restart_task(text) to authenticated;
