-- 당일 발행 글의 첫 스냅샷은 발행일부터 수집시각까지의 온전한 당일 조회수다.
create or replace function public.initialize_same_day_cafe_baseline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    run_metric_date date;
begin
    if new.last_cumulative_views is not null
       or new.published_date is null
       or new.last_seen_run_id is null then
        return new;
    end if;

    select metric_date
    into run_metric_date
    from public.marketing_ingestion_runs
    where id = new.last_seen_run_id
      and provider = 'naver_cafe';

    if new.published_date = run_metric_date then
        new.last_cumulative_views := 0;
        new.last_observed_at := run_metric_date::timestamp at time zone 'Asia/Seoul';
    end if;
    return new;
end;
$$;

drop trigger if exists initialize_same_day_cafe_baseline_trigger
on public.marketing_cafe_article_state;
create trigger initialize_same_day_cafe_baseline_trigger
before insert or update of published_date, last_seen_run_id
on public.marketing_cafe_article_state
for each row execute function public.initialize_same_day_cafe_baseline();

-- 과거 글을 처음 발견한 baseline은 0 증가분으로 공개하되 완전한 일 증가분으로 표시하지 않는다.
create or replace function public.reject_incomplete_cafe_baseline_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    baseline_count integer;
begin
    if new.source_details #>> '{naver_cafe,baseline_count}' is null then
        return new;
    end if;

    baseline_count := (new.source_details #>> '{naver_cafe,baseline_count}')::integer;
    if baseline_count > 0 then
        new.data_completeness := jsonb_set(
            coalesce(new.data_completeness, '{}'::jsonb),
            '{cafe_views}',
            'false'::jsonb,
            true
        );
        new.collection_status := 'partial';
    end if;
    return new;
end;
$$;

drop trigger if exists reject_incomplete_cafe_baseline_total_trigger
on public.daily_marketing_metrics;
create trigger reject_incomplete_cafe_baseline_total_trigger
before insert or update of cafe_views, data_completeness, source_details
on public.daily_marketing_metrics
for each row execute function public.reject_incomplete_cafe_baseline_total();

revoke all on function public.initialize_same_day_cafe_baseline()
from public, anon, authenticated;
revoke all on function public.reject_incomplete_cafe_baseline_total()
from public, anon, authenticated;
