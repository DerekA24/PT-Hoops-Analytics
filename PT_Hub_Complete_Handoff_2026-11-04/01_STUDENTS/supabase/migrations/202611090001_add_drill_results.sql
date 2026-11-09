create table if not exists public.pt_drill_results (
  id uuid primary key,
  batch_id uuid not null,
  player_id uuid not null references public.pt_players(id),
  result text not null check (result in ('win', 'loss')),
  practice_date date not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pt_drill_results_player_date_idx
  on public.pt_drill_results (player_id, practice_date);
create index if not exists pt_drill_results_recorded_at_idx
  on public.pt_drill_results (recorded_at desc);

alter table public.pt_drill_results enable row level security;
