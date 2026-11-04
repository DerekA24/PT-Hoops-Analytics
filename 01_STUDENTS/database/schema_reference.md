# Database schema reference (not a full migration)
Verified: 4 November 2026. All listed tables have RLS enabled.

* public.pt_players: id uuid PK, full_name text, jersey_number integer nullable, grade text nullable, position text nullable, auth_user_id uuid nullable (auth.users), active boolean default true, created_at timestamptz default now().
* public.pt_drills: id uuid PK, name text unique, active boolean default true, created_at timestamptz default now().
* public.pt_shots: id uuid PK, player_id uuid FK pt_players.id, drill_id uuid FK pt_drills.id, made boolean, practice_date date, created_at timestamptz, entered_by uuid nullable FK auth.users, notes text nullable.
* public.pt_coaches: user_id uuid PK/FK auth.users.id, created_at timestamptz.
* public.pt_hub_rate: bucket text, minute_window timestamptz, count integer; composite PK (bucket,minute_window); private rate limiting.

Policies exist for coach read/update/delete and authenticated data access. The Edge Function server client handles public snapshot and anonymous shooting. To reconstruct a project, separately export the actual schema, RLS policies, database functions, triggers, and migrations with school administrator approval; this document is explanatory only.

Data at preparation: 16 active players; 9 active drills; 2 coaches; 5 shots. Counts can change. No real player records included in the bundle.
