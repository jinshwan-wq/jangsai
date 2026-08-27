-- 스케줄러와 Edge Function 사이의 인증값을 Supabase Vault에서 자동 관리한다.
do $$
begin
    if not exists (select 1 from vault.decrypted_secrets where name = 'marketing_collector_url') then
        perform vault.create_secret(
            'https://pfmrqsfmkdnhzjimqocr.supabase.co/functions/v1/collect-marketing',
            'marketing_collector_url',
            '장스 마케팅 자동수집 Edge Function URL'
        );
    end if;

    if not exists (select 1 from vault.decrypted_secrets where name = 'marketing_collector_token') then
        perform vault.create_secret(
            replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
            'marketing_collector_token',
            '장스 마케팅 스케줄러 요청 인증값'
        );
    end if;
end;
$$;

create or replace function public.verify_marketing_collector_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
    select length(coalesce(p_token, '')) >= 32
       and exists (
           select 1
           from vault.decrypted_secrets
           where name = 'marketing_collector_token'
             and decrypted_secret = p_token
       );
$$;

revoke all on function public.verify_marketing_collector_token(text) from public;
grant execute on function public.verify_marketing_collector_token(text) to service_role;
