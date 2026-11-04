-- Automatic vote counting + duplicate detection for EN-COPA LATAM proofs.
-- Every image is one vote immediately; admins can reject individual images later.

alter table public.proof_submissions
  add column if not exists sha256 text,
  add column if not exists perceptual_hash text,
  add column if not exists ocr_text text,
  add column if not exists duplicate_flag boolean not null default false,
  add column if not exists duplicate_match_ids uuid[] not null default '{}',
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by text;

alter table public.proof_submissions
  drop constraint if exists proof_submissions_status_check;

update public.proof_submissions
set status = case
  when status = 'rejected' then 'rejected'
  else 'counted'
end;

alter table public.proof_submissions
  alter column status set default 'counted',
  add constraint proof_submissions_status_check
    check (status in ('counted', 'rejected'));

create index if not exists proof_submissions_sha256_idx
  on public.proof_submissions (sha256) where sha256 is not null;
create index if not exists proof_submissions_phash_idx
  on public.proof_submissions (perceptual_hash) where perceptual_hash is not null;
create index if not exists proof_submissions_duplicate_flag_idx
  on public.proof_submissions (duplicate_flag) where duplicate_flag = true;

create table if not exists public.proof_submission_audit (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.proof_submissions(id) on delete cascade,
  previous_status text not null,
  new_status text not null check (new_status in ('counted', 'rejected')),
  reason text,
  admin_actor text not null default 'EN-COPA Admin',
  created_at timestamptz not null default now()
);
create index if not exists proof_submission_audit_submission_idx
  on public.proof_submission_audit (submission_id, created_at desc);

alter table public.proof_submission_audit enable row level security;
grant select, insert on public.proof_submission_audit to service_role;
