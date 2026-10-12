-- Prelaunch ONLY: let curated synthetic authors appear in public community/event catalogues.
-- Consumer identity remains 32-hex Core hash. A seed account cannot sign in or call actor RPCs.
-- Real viewers still require normal adult verification, consent, blocking, publication and privacy checks.
-- Synthetic identity permission disappears automatically when stage switches to live.
create function public.feture_prelaunch_synthetic_author(p_actor text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, feture_seed
as $$
  select p_actor ~ '^seed:feture-development-2026-10:[a-z0-9-]{2,40}$'
    and exists (
      select 1 from feture_seed.environment e
       where e.singleton and e.project_ref = 'anrhayozrhrmiwexmbhw'
         and e.stage = 'prelaunch'
    )
    and exists (
      select 1 from feture_seed.records r
      join public.feture_profiles p on p.account_hash = r.row_key
      where r.table_name = 'feture_profiles'
        and r.dataset_id = 'feture-development-2026-10'
        and r.kind = 'synthetic-development'
        and r.row_key = p_actor
        and p.dating_enabled = false
    );
$$;
revoke all on function public.feture_prelaunch_synthetic_author(text) from public, anon, authenticated, service_role;
grant execute on function public.feture_prelaunch_synthetic_author(text) to service_role;

-- Preserve original human eligibility EXACTLY; append synthetic-author condition
-- only for ledger-owned, non-login seed namespace while prelaunch.
create or replace function public.feture_peer_eligible(p_owner text)
returns boolean language sql
set search_path = pg_catalog, public
as $$
 select public.feture_prelaunch_synthetic_author(p_owner)
    or (
      (
        exists(select 1 from public.feture_verification_attempts a
          join public.feture_verification_policies p
           on (p.issuer,p.environment,p.version)=(a.issuer,a.environment,a.policy_version)
          where a.account_hash=p_owner and a.current and a.state='verified'
            and a.environment='production' and p.enabled and p.threshold=18
            and a.proof_expires_at>clock_timestamp()
            and a.proof_issued_at<=clock_timestamp()
            and a.proof_expires_at<=a.proof_issued_at+p.proof_lifetime_ms*interval '1 millisecond')
        or public.feture_qa_adult_until(p_owner) is not null
      )
      and coalesce((public.feture_consent_status(p_owner,'ru')->>'accepted')::boolean,false)
    );
$$;
comment on function public.feture_prelaunch_synthetic_author(text)
 is 'Internal prelaunch synthetic PUBLIC author check; impossible to log in as seed: actor, off in stage live.';
notify pgrst,'reload schema';
