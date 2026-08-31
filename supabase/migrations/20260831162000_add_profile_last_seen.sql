-- 관리자가 사용자별 마지막 JangsAI 접속 시각을 확인할 수 있게 기록한다.
alter table public.profiles
    add column if not exists last_seen_at timestamptz;

update public.profiles profiles
set last_seen_at = users.last_sign_in_at
from auth.users users
where users.id = profiles.id
  and profiles.last_seen_at is null
  and users.last_sign_in_at is not null;

create index if not exists profiles_last_seen_at_idx
    on public.profiles (last_seen_at desc nulls last);

create or replace function public.touch_current_user_last_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
    touched_at timestamptz := now();
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;

    update public.profiles
    set last_seen_at = touched_at
    where id = auth.uid();

    if not found then
        raise exception 'profile not found';
    end if;
    return touched_at;
end;
$$;

revoke all on function public.touch_current_user_last_seen()
from public, anon;
grant execute on function public.touch_current_user_last_seen()
to authenticated;
