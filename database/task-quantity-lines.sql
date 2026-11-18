-- Additional quantity rows supplement the existing primary quantity.
alter table public.dockflow_tasks add column quantity_lines jsonb not null default '[]'::jsonb;
create or replace function public.dockflow_validate_quantity_lines() returns trigger
language plpgsql security invoker set search_path='' as $$
declare line jsonb; previous jsonb; normalized jsonb:='[]'; line_id text; target integer; completed integer; seen text[]:='{}';
begin
 if jsonb_typeof(new.quantity_lines)<>'array' or jsonb_array_length(new.quantity_lines)>19 then raise exception 'Use at most 20 quantity lines';end if;
 for line in select value from jsonb_array_elements(new.quantity_lines) loop
  line_id:=line->>'id';
  if line_id is null or length(line_id)<1 or length(line_id)>80 or line_id=any(seen) or (line->>'quantity_unit') is null or (line->>'quantity_unit') not in ('pallets','boxes','units') then raise exception 'Invalid quantity line';end if;
  seen:=array_append(seen,line_id);previous:=null;
  if tg_op='UPDATE' then select value into previous from jsonb_array_elements(old.quantity_lines) where value->>'id'=line_id;end if;
  target:=(line->>'target_quantity')::integer;
  completed:=coalesce((line->>'completed_quantity')::integer,(previous->>'completed_quantity')::integer,0);
  if target is null or target<1 or target>1000000 or completed<0 or completed>target then raise exception 'Invalid quantity or completed amount';end if;
  if previous is not null and (previous->>'completed_quantity')::integer>0 and line->>'quantity_unit'<>previous->>'quantity_unit' then raise exception 'Keep the same unit after recording progress';end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('id',line_id,'target_quantity',target,'quantity_unit',line->>'quantity_unit','completed_quantity',completed));
 end loop;
 if tg_op='UPDATE' then
  for previous in select value from jsonb_array_elements(old.quantity_lines) loop
   if (previous->>'completed_quantity')::integer>0 and not (previous->>'id'=any(seen)) then raise exception 'Cannot remove a quantity line with completed work';end if;
  end loop;
 end if;
 new.quantity_lines:=normalized;return new;
end;
$$;
create trigger dockflow_validate_quantity_lines before insert or update of quantity_lines on public.dockflow_tasks for each row execute function public.dockflow_validate_quantity_lines();
revoke all on function public.dockflow_validate_quantity_lines() from public,anon,authenticated;
create or replace function public.dockflow_complete_quantity_line(task_id text,line_id text)
returns public.dockflow_tasks language plpgsql security invoker set search_path='' as $$
declare item public.dockflow_tasks; position integer; line jsonb; done integer;
begin
 if not exists(select 1 from public.dockflow_members where user_id=(select auth.uid())) then raise exception 'Warehouse access required' using errcode='42501';end if;
 select * into item from public.dockflow_tasks where id=task_id for update;
 if not found then raise exception 'Task not found';end if;
 if item.started_at is null or item.paused_at is not null or item.finished_at is not null or item.status='Done' then raise exception 'Start or resume the task before recording progress';end if;
 select (ordinality-1)::integer,value into position,line from jsonb_array_elements(item.quantity_lines) with ordinality where value->>'id'=line_id;
 if line is null then raise exception 'Quantity line not found';end if;
 done:=(line->>'completed_quantity')::integer;
 if done>=(line->>'target_quantity')::integer then raise exception 'Quantity exceeds the remaining amount';end if;
 update public.dockflow_tasks set quantity_lines=jsonb_set(quantity_lines,array[position::text,'completed_quantity'],to_jsonb(done+1)) where id=task_id returning * into item;
 return item;
end;
$$;
revoke all on function public.dockflow_complete_quantity_line(text,text) from public,anon;
grant execute on function public.dockflow_complete_quantity_line(text,text) to authenticated;
