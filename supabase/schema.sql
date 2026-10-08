-- Proofit core. Run in the Supabase SQL editor or via `psql "$DATABASE_URL"`.
-- Ids are text so the indexer can upsert stable keys.

create table if not exists public.wallets (
  id text primary key,
  address text not null unique,
  label text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text,
  category text not null,
  status text not null,
  estimated_reward_usd numeric(20, 2) not null default 0
);

create table if not exists public.transactions (
  id text primary key,
  wallet_address text not null references public.wallets (address) on delete cascade,
  tx_hash text not null,
  chain_id integer not null,
  block_timestamp timestamptz not null,
  type text not null check (
    type in ('swap', 'bridge', 'approval', 'claim', 'transfer')
  ),
  gas_fee_usd numeric(20, 6) not null default 0,
  value_usd numeric(20, 6) not null default 0,
  campaign_id text references public.campaigns (id) on delete set null,
  raw_data jsonb,
  unique (wallet_address, tx_hash, chain_id)
);

create table if not exists public.campaign_checklist (
  id text primary key,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  title text not null,
  type text not null,
  contract_address text,
  is_completed boolean not null default false,
  wallet_address text,
  unique (campaign_id, title, wallet_address)
);

create index if not exists transactions_wallet_idx
  on public.transactions (wallet_address, block_timestamp desc);

create index if not exists transactions_campaign_idx
  on public.transactions (campaign_id);

create index if not exists checklist_wallet_idx
  on public.campaign_checklist (wallet_address);
