-- 가입 요청 승인 상태
-- 기존 사용자는 계속 이용할 수 있도록 먼저 approved로 채운 뒤,
-- 이후 생성되는 프로필만 pending을 기본값으로 사용한다.
alter table public.profiles
    add column if not exists approval_status text,
    add column if not exists reviewed_at timestamptz,
    add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

update public.profiles
set approval_status = 'approved'
where approval_status is null;

alter table public.profiles
    alter column approval_status set default 'pending',
    alter column approval_status set not null;

alter table public.profiles
    drop constraint if exists profiles_approval_status_check;

alter table public.profiles
    add constraint profiles_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected'));

create index if not exists profiles_approval_status_idx
    on public.profiles (approval_status, created_at desc);

-- 일반 사용자가 자신의 프로필을 수정할 수 있더라도 승인 상태를 조작하지 못하게 한다.
create or replace function public.protect_profile_approval_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    caller_role text;
begin
    if new.approval_status is not distinct from old.approval_status
       and new.reviewed_at is not distinct from old.reviewed_at
       and new.reviewed_by is not distinct from old.reviewed_by then
        return new;
    end if;

    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
        return new;
    end if;

    select role_id into caller_role
    from public.profiles
    where id = auth.uid();

    if caller_role = 'admin' then
        return new;
    end if;

    raise exception 'Only administrators can change signup approval status';
end;
$$;

drop trigger if exists protect_profile_approval_status_trigger on public.profiles;
create trigger protect_profile_approval_status_trigger
before update of approval_status, reviewed_at, reviewed_by
on public.profiles
for each row
execute function public.protect_profile_approval_status();

-- 승인 전 계정은 프로그램 메타데이터와 파일에 직접 접근할 수 없다.
drop policy if exists approved_profiles_only on public.programs;
create policy approved_profiles_only
on public.programs
as restrictive
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.approval_status = 'approved'
    )
);

drop policy if exists approved_profiles_only on public.program_roles;
create policy approved_profiles_only
on public.program_roles
as restrictive
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.approval_status = 'approved'
    )
);

drop policy if exists approved_program_downloads_only on storage.objects;
create policy approved_program_downloads_only
on storage.objects
as restrictive
for select
to authenticated
using (
    bucket_id <> 'programs'
    or exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.approval_status = 'approved'
    )
);
