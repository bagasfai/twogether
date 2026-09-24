-- core-schema-follow-ups.md, "Should fix soon": sessions.created_by had no
-- explicit `on delete` action, so it defaulted to `restrict` -- an admin
-- deleting any profile that has ever created a session (via the
-- profiles_delete_admin policy) hit a bare FK error instead of the delete
-- succeeding. Product decision: keep the session and its history, null out
-- the pointer to the since-deleted creator instead of blocking the delete.

alter table public.sessions
  alter column created_by drop not null;

alter table public.sessions
  drop constraint sessions_created_by_fkey,
  add constraint sessions_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;
