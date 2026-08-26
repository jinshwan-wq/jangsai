-- 기존 최고 관리자 계정 접근 복구
-- SQL Editor처럼 JWT가 없는 관리 세션도 유지보수 작업을 수행할 수 있게 한다.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select session_user in ('postgres', 'supabase_admin')
        or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
        or exists (
            select 1
            from public.profiles
            where id = auth.uid()
              and role_id = 'admin'
              and approval_status = 'approved'
        );
$$;

insert into public.profiles (
    id,
    username,
    display_name,
    role_id,
    approval_status,
    reviewed_at,
    reviewed_by
)
select
    users.id,
    'kher2000',
    coalesce(users.raw_user_meta_data ->> 'display_name', '최고 관리자'),
    'admin',
    'approved',
    now(),
    null
from auth.users as users
where lower(users.email) = 'kher2000@jangsai.local'
on conflict (id) do update
set username = excluded.username,
    role_id = 'admin',
    approval_status = 'approved',
    reviewed_at = now(),
    reviewed_by = null;

alter table public.profiles enable row level security;

drop policy if exists profile_self_or_admin_read on public.profiles;
create policy profile_self_or_admin_read
on public.profiles
for select
to authenticated
using (
    id = auth.uid()
    or public.is_current_user_admin()
);
