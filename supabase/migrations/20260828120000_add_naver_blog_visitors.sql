-- 제품별 협업 블로그의 공개 일 방문자 수를 자동 집계한다.

update public.marketing_contents contents
set is_active = false
from public.marketing_products products
where products.id = contents.product_id
  and products.slug in (
      'innerium-gala431',
      'innerium-minti431',
      'yural-tonggam-cream',
      'yural-myeongga-bonhwan'
  )
  and contents.channel = 'naver_blog';

with blog_sources(product_slug, blog_id) as (
    values
        ('yural-tonggam-cream', 'sqebloxynd99033'),
        ('yural-tonggam-cream', 'dtufvww'),
        ('yural-tonggam-cream', 'wjarykppj'),
        ('yural-tonggam-cream', 'myqskqymol03263'),
        ('yural-tonggam-cream', 'mbucamforu40603'),
        ('yural-tonggam-cream', 'gcoyzibd'),
        ('yural-tonggam-cream', 'dhqftyr'),
        ('yural-tonggam-cream', 'jqcqvvatrq54481'),
        ('yural-tonggam-cream', 'tydgsksfnx70984'),
        ('yural-tonggam-cream', 'fyvbrba'),
        ('yural-tonggam-cream', 'akoweqjjx'),
        ('yural-tonggam-cream', 'cyrrpjqeyp74956'),
        ('yural-tonggam-cream', 'ntizoikpio10326'),
        ('yural-tonggam-cream', 'hfjnjrszay25541'),
        ('yural-tonggam-cream', 'uoidkkt'),
        ('yural-myeongga-bonhwan', 'gksdusdnaj8460'),
        ('yural-myeongga-bonhwan', 'dhtjsgty525926'),
        ('yural-myeongga-bonhwan', 'rkdwltnii180'),
        ('yural-myeongga-bonhwan', 'rsdudtjrxb5731'),
        ('yural-myeongga-bonhwan', 'ebsport05714'),
        ('yural-myeongga-bonhwan', 'wkdtkdgusui9284'),
        ('yural-myeongga-bonhwan', 'thdalsflaxy5285'),
        ('yural-myeongga-bonhwan', 'sivktffndg44923'),
        ('yural-myeongga-bonhwan', 'fwclimb49741'),
        ('yural-myeongga-bonhwan', 'dedress9091'),
        ('yural-myeongga-bonhwan', 'rabbitmc50429'),
        ('yural-myeongga-bonhwan', 'dbsehddbspj9529'),
        ('yural-myeongga-bonhwan', 'rkddbalswk1627'),
        ('yural-myeongga-bonhwan', 'tikotpe'),
        ('yural-myeongga-bonhwan', 'isplbixszr87307'),
        ('innerium-gala431', 'd4yd6tmn4st01'),
        ('innerium-gala431', 'pwftagjkor98524'),
        ('innerium-gala431', 'wet4448'),
        ('innerium-gala431', 'prevail9850'),
        ('innerium-gala431', 'dkdlwjd1q'),
        ('innerium-gala431', 'happy24632'),
        ('innerium-gala431', 'pepper634'),
        ('innerium-gala431', 'tlejrdks9o'),
        ('innerium-gala431', 'nani1990s'),
        ('innerium-gala431', 'gracefulnotes'),
        ('innerium-minti431', 'eqwarm18351'),
        ('innerium-minti431', 'bjdrink952'),
        ('innerium-minti431', 'stillfp579696'),
        ('innerium-minti431', 'wjstjsghxv3150'),
        ('innerium-minti431', 'uytire40629'),
        ('innerium-minti431', 'dbswnsguria0619'),
        ('innerium-minti431', 'rxsteisxul32462'),
        ('innerium-minti431', 'wjdtjdhsrn0271'),
        ('innerium-minti431', 'xnffhene'),
        ('innerium-minti431', 'edbanana6862')
)
insert into public.marketing_contents (
    product_id,
    channel,
    title,
    url,
    is_active
)
select
    products.id,
    'naver_blog',
    products.name || ' 블로그 · ' || blog_sources.blog_id,
    'https://blog.naver.com/' || blog_sources.blog_id,
    true
from blog_sources
join public.marketing_products products on products.slug = blog_sources.product_slug
on conflict (url) do update
set product_id = excluded.product_id,
    channel = excluded.channel,
    title = excluded.title,
    is_active = true;

update public.marketing_source_mappings mappings
set is_enabled = false,
    updated_at = now()
from public.marketing_products products
where products.id = mappings.product_id
  and products.slug in (
      'innerium-gala431',
      'innerium-minti431',
      'yural-tonggam-cream',
      'yural-myeongga-bonhwan'
  )
  and mappings.provider = 'naver_blog';

insert into public.marketing_source_mappings (
    product_id,
    provider,
    external_id,
    config,
    is_enabled
)
select
    products.id,
    'naver_blog',
    'daily-visitors',
    jsonb_build_object('metric', 'blog_views', 'source', 'public_daily_visitors'),
    true
from public.marketing_products products
where products.slug in (
    'innerium-gala431',
    'innerium-minti431',
    'yural-tonggam-cream',
    'yural-myeongga-bonhwan'
)
on conflict (product_id, provider, external_id) do update
set config = excluded.config,
    is_enabled = true,
    updated_at = now();

do $$
declare
    active_count integer;
begin
    select count(*) into active_count
    from public.marketing_contents contents
    join public.marketing_products products on products.id = contents.product_id
    where contents.channel = 'naver_blog'
      and contents.is_active
      and products.slug in (
          'innerium-gala431',
          'innerium-minti431',
          'yural-tonggam-cream',
          'yural-myeongga-bonhwan'
      );
    if active_count <> 50 then
        raise exception '활성 네이버 블로그는 50개여야 합니다. 현재: %', active_count;
    end if;
end;
$$;

create or replace function public.invoke_marketing_collector_for_date(
    p_metric_date date,
    p_providers text[] default array['cafe24']::text[]
)
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
    collector_url text;
    collector_token text;
    request_id bigint;
begin
    if not exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role_id = 'admin'
          and approval_status = 'approved'
    ) then
        raise exception '관리자만 과거 데이터를 수집할 수 있습니다.';
    end if;
    if p_metric_date < date '2026-01-01'
       or p_metric_date >= timezone('Asia/Seoul', now())::date then
        raise exception '수집 가능 날짜가 아닙니다.';
    end if;
    if not (p_providers <@ array['cafe24', 'naver_search', 'naver_blog']::text[]) then
        raise exception '허용되지 않은 수집 채널입니다.';
    end if;

    select decrypted_secret into collector_url
    from vault.decrypted_secrets where name = 'marketing_collector_url' limit 1;
    select decrypted_secret into collector_token
    from vault.decrypted_secrets where name = 'marketing_collector_token' limit 1;
    if collector_url is null or collector_token is null then
        raise exception 'marketing collector Vault secrets are not configured';
    end if;

    select net.http_post(
        url := collector_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-collector-secret', collector_token
        ),
        body := jsonb_build_object(
            'metric_date', p_metric_date::text,
            'providers', to_jsonb(p_providers),
            'trigger', 'backfill_validation'
        )
    ) into request_id;
    return request_id;
end;
$$;

revoke all on function public.invoke_marketing_collector_for_date(date, text[]) from public;
grant execute on function public.invoke_marketing_collector_for_date(date, text[]) to authenticated;
