-- 작업 성공·실패 기록이 heartbeat의 runbook/session 검증 상태를 지우지 않게 한다.
create or replace function public.preserve_marketing_bridge_client_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.details := coalesce(old.details, '{}'::jsonb) || coalesce(new.details, '{}'::jsonb);
    return new;
end;
$$;

drop trigger if exists preserve_marketing_bridge_client_details
    on public.marketing_bridge_clients;

create trigger preserve_marketing_bridge_client_details
before update of details on public.marketing_bridge_clients
for each row
execute function public.preserve_marketing_bridge_client_details();

revoke all on function public.preserve_marketing_bridge_client_details()
    from public, anon, authenticated;
