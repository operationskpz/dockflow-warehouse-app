-- Single-warehouse access; apply only to the intended Supabase project.
-- Create Auth accounts through the Supabase administrator UI/API separately.
begin;
create table if not exists public.dockflow_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 role text not null default 'employee' check (role in ('manager','employee')),
 created_at timestamptz not null default now()
);
create table if not exists public.dockflow_employees (id text primary key, name text not null);
create table if not exists public.dockflow_tasks (
 id text primary key, title text not null, description text default '', category text not null default 'General',
 assignee text default '', status text not null default 'To Do', priority text not null default 'Medium',
 due text default '', attachment text default '', created_at timestamptz not null default now()
);
alter table public.dockflow_members enable row level security;
alter table public.dockflow_employees enable row level security;
alter table public.dockflow_tasks enable row level security;
revoke all on public.dockflow_members,public.dockflow_employees,public.dockflow_tasks from anon,authenticated;
grant select on public.dockflow_members to authenticated;
grant select,insert,update,delete on public.dockflow_employees,public.dockflow_tasks to authenticated;
drop policy if exists "DockFlow members read own membership" on public.dockflow_members;
create policy "DockFlow members read own membership" on public.dockflow_members for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "DockFlow employees read for members" on public.dockflow_employees;
create policy "DockFlow employees read for members" on public.dockflow_employees for select to authenticated using (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow employees insert for members" on public.dockflow_employees;
create policy "DockFlow employees insert for members" on public.dockflow_employees for insert to authenticated with check (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow employees update for members" on public.dockflow_employees;
create policy "DockFlow employees update for members" on public.dockflow_employees for update to authenticated using (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid()))) with check (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow employees delete for members" on public.dockflow_employees;
create policy "DockFlow employees delete for members" on public.dockflow_employees for delete to authenticated using (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow tasks read for members" on public.dockflow_tasks;
create policy "DockFlow tasks read for members" on public.dockflow_tasks for select to authenticated using (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow tasks insert for members" on public.dockflow_tasks;
create policy "DockFlow tasks insert for members" on public.dockflow_tasks for insert to authenticated with check (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow tasks update for members" on public.dockflow_tasks;
create policy "DockFlow tasks update for members" on public.dockflow_tasks for update to authenticated using (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid()))) with check (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow tasks delete for members" on public.dockflow_tasks;
create policy "DockFlow tasks delete for members" on public.dockflow_tasks for delete to authenticated using (exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit) values ('dockflow-attachments','dockflow-attachments',false,5000000) on conflict(id) do update set public=false,file_size_limit=5000000;
drop policy if exists "DockFlow read attachments for members" on storage.objects;
create policy "DockFlow read attachments for members" on storage.objects for select to authenticated using (bucket_id='dockflow-attachments' and exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow upload attachments for members" on storage.objects;
create policy "DockFlow upload attachments for members" on storage.objects for insert to authenticated with check (bucket_id='dockflow-attachments' and exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow update attachments for members" on storage.objects;
create policy "DockFlow update attachments for members" on storage.objects for update to authenticated using (bucket_id='dockflow-attachments' and exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid()))) with check (bucket_id='dockflow-attachments' and exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
drop policy if exists "DockFlow delete attachments for members" on storage.objects;
create policy "DockFlow delete attachments for members" on storage.objects for delete to authenticated using (bucket_id='dockflow-attachments' and exists (select 1 from public.dockflow_members m where m.user_id=(select auth.uid())));
commit;
