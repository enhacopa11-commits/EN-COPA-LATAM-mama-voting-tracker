
-- MAMA 2026 VOTING TRACKER
-- Initial database schema

-- Participants
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  x_username text not null,
  country_code char(2) not null,
  created_at timestamptz not null default now()
);

-- Prevent duplicate X usernames (case-insensitive)
create unique index participants_x_username_unique
  on public.participants (lower(trim(x_username)));

-- Certificate submissions
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null
    references public.participants(id) on delete cascade,
  reference_number text not null,
  certificate_date date not null,
  upload_date_kst date not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);

-- A certificate reference can only be submitted once
create unique index certificates_reference_unique
  on public.certificates (lower(trim(reference_number)));

-- Ranking and history indexes
create index certificates_participant_status_idx
  on public.certificates (participant_id, status);

create index certificates_upload_date_idx
  on public.certificates (upload_date_kst);

-- Security: enable Row Level Security
alter table public.participants enable row level security;
alter table public.certificates enable row level security;

-- No public access policies are created yet.
-- Submissions and reads will be handled by secure server routes.
