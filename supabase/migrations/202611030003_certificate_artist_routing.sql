-- Route accepted certificate records to the correct artist/platform totals.
-- Existing certificates remain assigned to ENHYPEN for backwards compatibility.
alter table public.certificates
  add column if not exists artist text not null default 'ENHYPEN'
    check (artist in ('ENHYPEN', 'CORTIS')),
  add column if not exists platform text
    check (platform in ('mnet_plus', 'mma') or platform is null);

create index if not exists certificates_artist_platform_status_idx
  on public.certificates (artist, platform, status);
