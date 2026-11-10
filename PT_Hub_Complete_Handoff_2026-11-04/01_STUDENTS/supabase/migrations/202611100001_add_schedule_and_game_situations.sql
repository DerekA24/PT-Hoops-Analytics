create table if not exists public.pt_schedule_records (
  id uuid primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.pt_game_situations (
  id uuid primary key,
  practice_date date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pt_game_situations_date_idx
  on public.pt_game_situations (practice_date, created_at desc);

alter table public.pt_schedule_records enable row level security;
alter table public.pt_game_situations enable row level security;
