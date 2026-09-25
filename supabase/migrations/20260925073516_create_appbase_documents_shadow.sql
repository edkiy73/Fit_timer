create table if not exists public.appbase_documents (
  account_hash text not null,
  profile_id text not null,
  doc_key text not null,
  revision bigint not null check (revision >= 1),
  schema_version integer not null default 1 check (schema_version >= 1),
  device_id text not null default '',
  deleted boolean not null default false,
  payload text,
  source_at timestamptz,
  shadowed_at timestamptz not null default now(),
  primary key (account_hash, profile_id, doc_key),
  constraint appbase_documents_account_hash_len check (char_length(account_hash) between 8 and 128),
  constraint appbase_documents_profile_id_len check (char_length(profile_id) between 1 and 80),
  constraint appbase_documents_doc_key_len check (char_length(doc_key) between 1 and 180)
);

create index if not exists appbase_documents_account_profile_idx
  on public.appbase_documents (account_hash, profile_id);

create index if not exists appbase_documents_shadowed_at_idx
  on public.appbase_documents (shadowed_at desc);

alter table public.appbase_documents enable row level security;
revoke all on table public.appbase_documents from anon, authenticated;
