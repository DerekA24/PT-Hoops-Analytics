create table if not exists public.pt_coach_access (
  id text primary key,
  code_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.pt_coach_access enable row level security;
