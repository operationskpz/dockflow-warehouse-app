-- Complete every quantity line in the same update that finishes the task.
create or replace function public.dockflow_finish_quantities()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='Done' then
  new.completed_quantity:=coalesce(new.target_quantity,0);
  select coalesce(jsonb_agg(jsonb_set(value,'{completed_quantity}',value->'target_quantity') order by ordinality),'[]'::jsonb)
  into new.quantity_lines from jsonb_array_elements(new.quantity_lines) with ordinality;
 end if;
 return new;
end;
$$;
-- Runs after the existing timing and quantity-validation triggers.
create trigger dockflow_zz_finish_quantities before update of status on public.dockflow_tasks for each row execute function public.dockflow_finish_quantities();
revoke all on function public.dockflow_finish_quantities() from public,anon,authenticated;
