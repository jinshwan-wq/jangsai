-- Auth 계정과 profiles 불일치 일괄 복구
begin;

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

-- Auth에는 있지만 profiles에 없는 가입 계정을 승인 대기 상태로 복원한다.
insert into public.profiles (
    id,
    username,
    display_name,
    role_id,
    approval_status
)
select
    users.id,
    coalesce(
        nullif(users.raw_user_meta_data ->> 'username', ''),
        split_part(users.email, '@', 1)
    ),
    coalesce(
        nullif(users.raw_user_meta_data ->> 'display_name', ''),
        nullif(users.raw_user_meta_data ->> 'username', ''),
        split_part(users.email, '@', 1)
    ),
    'trainee',
    'pending'
from auth.users as users
where not exists (
    select 1 from public.profiles where profiles.id = users.id
);

-- 최고 관리자 계정은 이메일 앞부분을 기준으로 확실하게 복구한다.
update public.profiles as profiles
set username = 'kher2000',
    display_name = coalesce(nullif(profiles.display_name, ''), '최고 관리자'),
    role_id = 'admin',
    approval_status = 'approved',
    reviewed_at = now(),
    reviewed_by = null
from auth.users as users
where profiles.id = users.id
  and split_part(lower(users.email), '@', 1) = 'kher2000';

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

drop policy if exists profile_admin_update on public.profiles;
create policy profile_admin_update
on public.profiles
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists profile_admin_delete on public.profiles;
create policy profile_admin_delete
on public.profiles
for delete
to authenticated
using (public.is_current_user_admin());

commit;

-- 실행 결과에 모든 계정과 상태가 표시되어야 한다.
select
    profiles.username as 아이디,
    profiles.display_name as 이름,
    profiles.role_id as 등급,
    profiles.approval_status as 승인상태
from public.profiles as profiles
order by profiles.created_at;
