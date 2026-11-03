create table if not exists public.collab_submissions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  platform text not null check (platform in ('mnet_plus','mma')),
  votes integer not null check (votes between 1 and 10000),
  submission_date_kst date not null,
  storage_path text not null unique,
  original_filename text,
  created_at timestamptz not null default now(),
  unique (participant_id, platform, submission_date_kst)
);

create index if not exists collab_submissions_day_platform_idx
  on public.collab_submissions (submission_date_kst, platform);

alter table public.collab_submissions enable row level security;

grant select, insert, update on public.collab_submissions to service_role;
