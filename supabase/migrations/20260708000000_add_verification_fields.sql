alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists subscription_status text not null default 'none';
