-- Append-only shared task updates. Photos use the existing private attachment bucket.
create table public.dockflow_task_updates (
 id uuid primary key default gen_random_uuid(),
 task_id text not null references public.dockflow_tasks(id) on delete cascade,
 author_id uuid default auth.uid() references auth.users(id) on delete set null,
 author_name text not null default coalesce(auth.jwt()->>'email','Employee'),
 body text not null default '' check(length(body)<=4000),
 photo_path text unique,
 created_at timestamptz not null default now(),
 constraint update_has_content check(length(btrim(body))>0 or photo_path is not null),
 constraint update_photo_owner check(photo_path is null or photo_path like author_id::text||'/updates/%')
);
create index dockflow_task_updates_thread on public.dockflow_task_updates(task_id,created_at desc,id desc);
create index dockflow_task_updates_author on public.dockflow_task_updates(author_id);
alter table public.dockflow_task_updates enable row level security;
revoke all on public.dockflow_task_updates from anon,authenticated;
grant select on public.dockflow_task_updates to authenticated;
grant insert(id,task_id,body,photo_path) on public.dockflow_task_updates to authenticated;
create policy "Warehouse members read task updates" on public.dockflow_task_updates for select to authenticated using(exists(select 1 from public.dockflow_members where user_id=(select auth.uid())));
create policy "Warehouse members post their own task updates" on public.dockflow_task_updates for insert to authenticated with check(author_id=(select auth.uid()) and exists(select 1 from public.dockflow_members where user_id=(select auth.uid())) and exists(select 1 from public.dockflow_tasks where id=task_id));
