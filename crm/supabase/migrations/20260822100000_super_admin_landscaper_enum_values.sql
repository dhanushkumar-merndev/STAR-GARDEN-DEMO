-- New role values only. Deliberately its own migration, with nothing else in
-- it: Postgres will not let a new enum value be *used* (compared, cast, or
-- inserted as a literal) in the same transaction that adds it — "unsafe use
-- of new value of enum type". Splitting the ADD VALUE statements into their
-- own migration file guarantees they are committed before
-- `20260822100100_super_admin_landscaper_roles` ever references them,
-- regardless of how the migration runner batches statements.
--
-- SUPER_ADMIN sits above ADMIN: full access, including Accounts, Reports,
-- Marketing and Settings, which a plain ADMIN no longer reaches.
--
-- LANDSCAPER replaces DESIGNER going forward — same job (attend the site
-- visit, then design), renamed because an Admin and a BDM turned out to need
-- the same "who can be the landscaper on this visit" pool as the dedicated
-- role. The DESIGNER value cannot be dropped from the enum without recreating
-- the type, so it stays, permanently unused — see `20260822100100`, which
-- migrates every existing DESIGNER profile to LANDSCAPER.
alter type public.user_role add value if not exists 'SUPER_ADMIN' before 'ADMIN';
alter type public.user_role add value if not exists 'LANDSCAPER' after 'DESIGNER';
