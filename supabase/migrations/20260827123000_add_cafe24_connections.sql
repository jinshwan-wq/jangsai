create table if not exists public.marketing_provider_connections (
    id uuid primary key default gen_random_uuid(),
    provider text not null check (provider in ('cafe24')),
    account_key text not null,
    access_token_secret_id uuid,
    refresh_token_secret_id uuid,
    access_token_expires_at timestamptz,
    refresh_token_expires_at timestamptz,
    scopes jsonb not null default '[]'::jsonb,
    status text not null default 'connected' check (status in ('connected', 'expired', 'revoked', 'error')),
    connected_at timestamptz not null default now(),
    last_refreshed_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (provider, account_key)
);

alter table public.marketing_provider_connections enable row level security;
revoke all on public.marketing_provider_connections from anon, authenticated;

create table if not exists public.marketing_oauth_states (
    state text primary key,
    provider text not null check (provider in ('cafe24')),
    account_key text not null,
    requested_by uuid not null references auth.users(id) on delete cascade,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.marketing_oauth_states enable row level security;
revoke all on public.marketing_oauth_states from anon, authenticated;

create or replace function public.save_cafe24_connection(
    p_mall_id text,
    p_access_token text,
    p_refresh_token text,
    p_access_token_expires_at timestamptz,
    p_refresh_token_expires_at timestamptz,
    p_scopes jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
    connection_record public.marketing_provider_connections%rowtype;
    access_secret_id uuid;
    refresh_secret_id uuid;
begin
    if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
        raise exception 'service_role only';
    end if;
    if p_mall_id !~ '^[a-z0-9][a-z0-9_-]{1,39}$' then
        raise exception 'invalid Cafe24 mall ID';
    end if;
    if length(coalesce(p_access_token, '')) < 20 or length(coalesce(p_refresh_token, '')) < 20 then
        raise exception 'invalid Cafe24 token';
    end if;

    select *
    into connection_record
    from public.marketing_provider_connections
    where provider = 'cafe24' and account_key = p_mall_id
    for update;

    if connection_record.id is null then
        access_secret_id := vault.create_secret(
            p_access_token,
            'cafe24_access_' || p_mall_id,
            'Cafe24 access token for ' || p_mall_id
        );
        refresh_secret_id := vault.create_secret(
            p_refresh_token,
            'cafe24_refresh_' || p_mall_id,
            'Cafe24 refresh token for ' || p_mall_id
        );
    else
        access_secret_id := connection_record.access_token_secret_id;
        refresh_secret_id := connection_record.refresh_token_secret_id;
        perform vault.update_secret(access_secret_id, p_access_token);
        perform vault.update_secret(refresh_secret_id, p_refresh_token);
    end if;

    insert into public.marketing_provider_connections (
        provider, account_key, access_token_secret_id, refresh_token_secret_id,
        access_token_expires_at, refresh_token_expires_at, scopes, status,
        connected_at, last_refreshed_at, last_error, updated_at
    )
    values (
        'cafe24', p_mall_id, access_secret_id, refresh_secret_id,
        p_access_token_expires_at, p_refresh_token_expires_at, coalesce(p_scopes, '[]'::jsonb),
        'connected', now(), now(), null, now()
    )
    on conflict (provider, account_key) do update set
        access_token_secret_id = excluded.access_token_secret_id,
        refresh_token_secret_id = excluded.refresh_token_secret_id,
        access_token_expires_at = excluded.access_token_expires_at,
        refresh_token_expires_at = excluded.refresh_token_expires_at,
        scopes = excluded.scopes,
        status = 'connected',
        last_refreshed_at = now(),
        last_error = null,
        updated_at = now();
end;
$$;

create or replace function public.get_cafe24_connection(p_mall_id text)
returns jsonb
language sql
security definer
set search_path = public, vault
as $$
    select case
        when coalesce(auth.jwt()->>'role', '') <> 'service_role' then null
        else (
            select jsonb_build_object(
                'mall_id', connections.account_key,
                'access_token', access_secret.decrypted_secret,
                'refresh_token', refresh_secret.decrypted_secret,
                'access_token_expires_at', connections.access_token_expires_at,
                'refresh_token_expires_at', connections.refresh_token_expires_at,
                'scopes', connections.scopes,
                'status', connections.status
            )
            from public.marketing_provider_connections connections
            join vault.decrypted_secrets access_secret
              on access_secret.id = connections.access_token_secret_id
            join vault.decrypted_secrets refresh_secret
              on refresh_secret.id = connections.refresh_token_secret_id
            where connections.provider = 'cafe24'
              and connections.account_key = p_mall_id
        )
    end;
$$;

revoke all on function public.save_cafe24_connection(text, text, text, timestamptz, timestamptz, jsonb) from public;
revoke all on function public.get_cafe24_connection(text) from public;
grant execute on function public.save_cafe24_connection(text, text, text, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.get_cafe24_connection(text) to service_role;

insert into public.marketing_source_mappings (product_id, provider, external_id, config, is_enabled)
select
    products.id,
    'cafe24',
    null,
    jsonb_build_object(
        'mall_id', case products.brand when '이너리움' then 'innerium' else 'jgohdapt' end,
        'product_no', null
    ),
    false
from public.marketing_products products
where products.brand in ('이너리움', '유랄')
  and not exists (
      select 1
      from public.marketing_source_mappings existing
      where existing.product_id = products.id
        and existing.provider = 'cafe24'
  );
