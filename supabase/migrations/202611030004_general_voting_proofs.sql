-- General EN-COPA LATAM voting proof submissions.
-- Legacy MAMA/certificate data is intentionally preserved.
create table if not exists public.proof_submissions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  campaign_name text not null check (char_length(campaign_name) between 2 and 120),
  country_code char(2) not null,
  storage_path text not null unique,
  original_filename text,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  status text not null default 'pending_review'
    check (status in ('pending_review','reviewed','approved','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists proof_submissions_campaign_created_idx
  on public.proof_submissions (campaign_name, created_at desc);

create index if not exists proof_submissions_participant_created_idx
  on public.proof_submissions (participant_id, created_at desc);

alter table public.proof_submissions enable row level security;
grant select, insert, update on public.proof_submissions to service_role;
