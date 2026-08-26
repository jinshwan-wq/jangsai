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

update public.profiles
set role_id = 'admin',
    approval_status = 'approved',
    reviewed_at = now(),
    reviewed_by = null
where username = 'kher2000';
