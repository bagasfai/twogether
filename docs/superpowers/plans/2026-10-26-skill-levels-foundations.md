# Skill Levels and Gender Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add gender and a host/admin-only skill level for members and guests, with host editing in the roster, so phase 2 (stats) and phase 3 (matcher) have trustworthy inputs.

**Architecture:** Two enums and three new storage locations: `profiles_private.gender` (member's own), `member_levels` (host/admin-only, permanent), and `guest_attributes` (host/admin-only, per guest participant). A pure resolver turns raw rows into one `PlayerAttributes` shape. Reads for the roster go through a new host-only DAL so level never rides along on member-facing queries.

**Tech Stack:** Next.js App Router server actions, Supabase (Postgres, RLS, pgTAP), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-skill-levels-and-auto-match-design.md` (Phase 1)

## Global Constraints

- Level enum `skill_level`: `newbie`, `beginner`, `novice`, `intermediate`, `advanced`, mapped to weights 1–5. Unrated players use weight 3.
- Gender enum `gender`: `male`, `female`.
- Level is never readable by members, including their own row, and never appears in a member-facing query, view, or realtime payload. `profiles` is not modified.
- A level change for a registered member is permanent (`member_levels`). A guest's gender and level apply to that guest participant only.
- Gender is required to check in a guest. Level is optional.
- Missing gender excludes a player from gendered formats (enforced in phase 3; phase 1 only exposes the value and the check-in rule).
- Authorization lives in RLS first; UI gating is convenience only.
- Migration names follow `supabase/migrations/<YYYYMMDD>0000NN_<name>.sql`. Regenerate types with `npx supabase gen types typescript --local > types/supabase.ts` after the last migration.
- Tests: unit tests in `tests/unit/*.test.ts` run with `npm run test:unit`; DB tests are pgTAP in `supabase/tests/*.test.sql` run with `npx supabase test db`.

## Deviations from the spec (decided while planning)

1. The spec put `guest_gender` and `guest_level` on `participants`. The existing policy `participants_select_self_host_or_public` (`20260917000001_guest_participants.sql:32`) lets the member who brought a guest, and anyone when the session is public, read guest rows. Columns on that table would leak guest level. This plan stores them in a host/admin-only `guest_attributes` table instead.
2. The spec says gender is inline-editable by hosts, but `profiles_private` updates are self-only. This plan adds the RPC `host_set_member_gender` (host/admin only) so a host can fill in a registered member's missing gender.

## Review Focus

- A member reading their own `member_levels` row must get nothing (not an error-free empty leak of another row).
- A member who brought a guest (`registered_by`) must not be able to read that guest's level or gender, including in a public session.
- Setting a level for a member with no existing `member_levels` row must insert, and a second set must update (upsert), recording `set_by`.
- Checking in a guest with no gender must fail with a clear message; a member with no gender must still check in normally.
- Deleting a guest participant must remove its `guest_attributes` row.
- An invalid gender or level string must be rejected by the zod schemas before reaching the database.
- A host of an unrelated session can set a level (spec: hosts and admins, not per-session); a plain member cannot.

---

### Task 1: Enums and `member_levels`

**Files:**
- Create: `supabase/migrations/20261026000001_skill_levels.sql`
- Test: `supabase/tests/031_member_levels.test.sql`

**Interfaces:**
- Produces: enums `public.gender`, `public.skill_level`; table `public.member_levels(user_id uuid primary key references public.profiles(id) on delete cascade, level public.skill_level not null, set_by uuid references public.profiles(id), updated_at timestamptz not null default now())`.

- [ ] **Step 1: Write the failing pgTAP test.** Follow the user-impersonation pattern in `supabase/tests/013_profiles_private.test.sql`. Assertions: (a) a host can `insert` then `update` a `member_levels` row; (b) an admin can select any row; (c) a plain member selecting from `member_levels` gets zero rows even for their own `user_id`; (d) a plain member `insert` is denied (`throws_ok` with `42501` or policy violation); (e) `anon` has no privileges on the table.
- [ ] **Step 2: Run** `npx supabase test db` and confirm `031_member_levels` fails (relation does not exist).
- [ ] **Step 3: Write the migration.** Create both enums (style of `20260911000001_enums_and_utils.sql:1-7`), the table, enable RLS, `revoke all` from `anon` and `authenticated`, then `grant select, insert, update` to `authenticated`. One policy per command, each with `using`/`with check` of `public.current_user_role() in ('host','admin')`. Verify the actual `user_role` values in `20260911000001_enums_and_utils.sql` before writing the predicate. Add a trigger or default so `updated_at` refreshes on update, following any existing `updated_at` helper in the enums/utils migration.
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db`. Expected: `031_member_levels` passes, earlier tests still pass.
- [ ] **Step 5: Commit** `git add supabase && git commit -m "feat: add skill_level enum and host-only member_levels"`

### Task 2: Member gender and host gender RPC

**Files:**
- Create: `supabase/migrations/20261026000002_member_gender.sql`
- Test: `supabase/tests/032_member_gender.test.sql`

**Interfaces:**
- Consumes: enum `public.gender` (Task 1).
- Produces: column `profiles_private.gender public.gender null`; function `public.host_set_member_gender(p_user_id uuid, p_gender public.gender) returns void`, `security definer`, restricted to host/admin.

- [ ] **Step 1: Write the failing test.** Assertions: (a) a member can update their own `profiles_private.gender`; (b) a member cannot update another member's gender directly; (c) a host calling `host_set_member_gender` sets the value; (d) a plain member calling it gets an exception; (e) calling it for a user with no `profiles_private` row inserts one rather than silently doing nothing.
- [ ] **Step 2: Run** `npx supabase test db`; expect `032` to fail.
- [ ] **Step 3: Implement.** Add the column. Write the function with `set search_path = ''`, an explicit `current_user_role() in ('host','admin')` check raising `insufficient_privilege`, and `insert ... on conflict (user_id) do update set gender = excluded.gender`. Revoke execute from `public`/`anon`, grant to `authenticated`.
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db`; expect all pass.
- [ ] **Step 5: Commit** `git commit -m "feat: add member gender and host_set_member_gender rpc"` (after `git add supabase`).

### Task 3: `guest_attributes`

**Files:**
- Create: `supabase/migrations/20261026000003_guest_attributes.sql`
- Test: `supabase/tests/033_guest_attributes.test.sql`

**Interfaces:**
- Consumes: enums from Task 1.
- Produces: table `public.guest_attributes(participant_id uuid primary key references public.participants(id) on delete cascade, gender public.gender, level public.skill_level, updated_at timestamptz not null default now())`. Select/insert/update for authenticated users where `public.is_session_host((select session_id from public.participants where id = participant_id))` or `public.is_admin()`.

- [ ] **Step 1: Write the failing test.** Assertions: (a) the host of the guest's session can insert and update; (b) the host of a different session is denied; (c) the member who brought the guest (`registered_by`) selects zero rows, in a public session too; (d) deleting the participant row removes the attribute row; (e) the table has a check or trigger so rows can only attach to guest participants (`guest_name is not null`); assert that inserting for a member participant fails.
- [ ] **Step 2: Run** `npx supabase test db`; expect `033` to fail.
- [ ] **Step 3: Implement the migration** per the interface. Enforce guest-only with a `before insert` trigger (a check constraint cannot reference another table). RLS enabled, privileges revoked then granted as in Task 1.
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db`; expect all pass.
- [ ] **Step 5: Commit** `git commit -m "feat: add host-only guest_attributes"` (after `git add supabase`).

### Task 4: Types, constants, validation

**Files:**
- Modify: `types/supabase.ts` (regenerated)
- Create: `lib/players/levels.ts`, `lib/validation/player-attributes.ts`
- Test: `tests/unit/player-attributes-validation.test.ts`

**Interfaces:**
- Produces in `lib/players/levels.ts`: `export const SKILL_LEVELS = ['newbie','beginner','novice','intermediate','advanced'] as const; export type SkillLevel = typeof SKILL_LEVELS[number]; export const GENDERS = ['male','female'] as const; export type Gender = typeof GENDERS[number]; export const UNRATED_WEIGHT = 3; export function levelWeight(level: SkillLevel | null): number`.
- Produces in `lib/validation/player-attributes.ts`: `setMemberLevelSchema` ({ userId: uuid, level: SkillLevel }), `setGuestAttributesSchema` ({ participantId: uuid, gender: Gender.optional(), level: SkillLevel.nullable().optional() }), `setMemberGenderSchema` ({ userId: uuid, gender: Gender }).

- [ ] **Step 1: Write the failing tests** in `tests/unit/player-attributes-validation.test.ts`: `levelWeight('newbie') === 1`, `levelWeight('advanced') === 5`, `levelWeight(null) === 3`; `setMemberLevelSchema.safeParse({ userId: <uuid>, level: 'expert' }).success === false`; `setMemberGenderSchema.safeParse({ userId: <uuid>, gender: 'other' }).success === false`; a valid guest payload parses.
- [ ] **Step 2: Run** `npm run test:unit -- player-attributes-validation`; expect failure (modules missing).
- [ ] **Step 3: Implement** the constants and schemas, deriving the zod enums from `SKILL_LEVELS` and `GENDERS` so there is one source of truth (match style in `lib/validation/participants.ts`). Run `npx supabase gen types typescript --local > types/supabase.ts`.
- [ ] **Step 4: Run** `npm run test:unit` and `npx tsc --noEmit`; expect pass.
- [ ] **Step 5: Commit** `git commit -m "feat: add level constants, validation, regenerated types"` (after `git add lib tests types`).

### Task 5: Resolver, DAL and actions

**Files:**
- Create: `lib/players/resolve.ts`, `lib/dal/player-attributes.ts`, `lib/actions/player-attributes.ts`
- Test: `tests/unit/resolve-player-attributes.test.ts`

**Interfaces:**
- Consumes: `SkillLevel`, `Gender`, `levelWeight` (Task 4); schemas (Task 4).
- Produces in `lib/players/resolve.ts`: `export type PlayerAttributes = { gender: Gender | null; level: SkillLevel | null; unrated: boolean; weight: number }`; `export function resolvePlayerAttributes(raw: { gender: Gender | null; level: SkillLevel | null }): PlayerAttributes` (`unrated` is true when level is null, `weight` is `levelWeight(level)`); `export function checkInBlockedReason(p: { isGuest: boolean; gender: Gender | null }): string | null` (returns a message only for a guest with no gender).
- Produces in `lib/dal/player-attributes.ts`: `export async function getRosterAttributes(sessionId: string): Promise<Map<string, PlayerAttributes>>` keyed by participant id. Members come from `profiles_private.gender` and `member_levels`; guests from `guest_attributes`. Host/admin only by RLS; the function returns an empty map on denied reads rather than throwing, following `lib/dal/participants.ts`.
- Produces in `lib/actions/player-attributes.ts`: `setMemberLevel(input)` (upsert into `member_levels` with `set_by = auth.uid()`), `setMemberGender(input)` (calls `host_set_member_gender`), `setGuestAttributes(input)` (upsert into `guest_attributes`). Each validates with its schema, returns the same result shape as `lib/actions/participants.ts:setCheckedIn`, and revalidates the session manage path.

- [ ] **Step 1: Write the failing tests** in `tests/unit/resolve-player-attributes.test.ts`: `resolvePlayerAttributes({ gender: 'male', level: null })` has `unrated: true, weight: 3`; with `level: 'advanced'` has `unrated: false, weight: 5`; `checkInBlockedReason({ isGuest: true, gender: null })` returns a non-empty string; `checkInBlockedReason({ isGuest: false, gender: null })` returns `null`; `checkInBlockedReason({ isGuest: true, gender: 'female' })` returns `null`.
- [ ] **Step 2: Run** `npm run test:unit -- resolve-player-attributes`; expect failure.
- [ ] **Step 3: Implement** the three files per the interfaces. Fetch roster attributes in two queries (participants with `user_id`/`guest_name`, then batched `in` lookups) to avoid per-row queries.
- [ ] **Step 4: Run** `npm run test:unit` and `npx tsc --noEmit`; expect pass.
- [ ] **Step 5: Commit** `git commit -m "feat: add player attribute resolver, dal and actions"` (after `git add lib tests`).

### Task 6: Guest check-in rule

**Files:**
- Modify: `lib/actions/participants.ts:55-80` (`setCheckedIn`)

**Interfaces:**
- Consumes: `checkInBlockedReason` (Task 5).

- [ ] **Step 1: Confirm the rule's test exists.** The guest-without-gender rule is covered by the `checkInBlockedReason` tests from Task 5. Server actions are not unit-tested in this repo, so the action wiring is verified manually in Step 4.
- [ ] **Step 2: Modify `setCheckedIn`.** Before the `.update({ checked_in_at })` at line 69, when checking in (not undoing) and the participant has `guest_name`, load that participant's `guest_attributes.gender` and return the error from `checkInBlockedReason` if it is non-null. Members are unaffected.
- [ ] **Step 3: Run** `npx tsc --noEmit` and `npm run test:unit`; expect pass.
- [ ] **Step 4: Manual verification** with the `run` skill: in a session with a guest, try to check in the guest without gender (expect the error message), set gender, check in again (expect success), and check in a member without gender (expect success).
- [ ] **Step 5: Commit** `git commit -m "feat: require gender to check in a guest"` (after `git add lib`).

### Task 7: Roster editing UI

**Files:**
- Create: `components/sessions/player-attributes-editor.tsx`
- Modify: `components/sessions/roster-table.tsx` (row rendering near `:73-76`, `:138`, `:147`) and the page or loader that supplies roster data to it (find with `grep -rn "RosterTable" app components`)

**Interfaces:**
- Consumes: `getRosterAttributes`, `setMemberLevel`, `setMemberGender`, `setGuestAttributes` (Task 5); `SKILL_LEVELS`, `GENDERS`.
- Produces: `PlayerAttributesEditor({ participantId, userId, isGuest, attributes }: {...})`, a client component built from shadcn `Select` for gender and level.

- [ ] **Step 1: Build `PlayerAttributesEditor`** with two selects. For a member, level calls `setMemberLevel` and gender calls `setMemberGender`; for a guest, both call `setGuestAttributes`. Show a "?" badge with a tooltip "Unrated: matcher assumes a mid level" when `attributes.unrated`. Show a muted "Set gender" prompt when gender is null. Use react-hook-form only if the project's other inline editors do; otherwise plain controlled selects with optimistic state.
- [ ] **Step 2: Wire it into `roster-table.tsx`.** Load attributes with `getRosterAttributes` in the host-only manage page (not in any shared loader) and pass them down. Render the editor on every row. This view is host-only; confirm the page already gates on `is_session_host` and do not render the editor elsewhere.
- [ ] **Step 3: Run** `npx tsc --noEmit` and `npm run build`; expect success.
- [ ] **Step 4: Manual verification** with the `run` skill: change a member's level and reload (it persists); change a guest's level; confirm a plain member account never receives level data (inspect the network tab on their session page for the string `level`).
- [ ] **Step 5: Commit** `git commit -m "feat: host can edit gender and level in the roster"` (after `git add components app lib`).

### Task 8: Member gender in the profile form

**Files:**
- Modify: `lib/validation/profile.ts:8` (`profileSchema`), `lib/actions/profile.ts:9-32` (`updateProfile`), `lib/dal/profile.ts:15-25` (`getMyProfile`), `components/profile/profile-form.tsx`
- Test: `tests/unit/validation.test.ts` or a new `tests/unit/profile-gender.test.ts`

**Interfaces:**
- Consumes: `GENDERS` (Task 4).
- Produces: `profileSchema` gains optional `gender`; `getMyProfile` returns `gender: Gender | null`.

- [ ] **Step 1: Write the failing test:** `profileSchema.safeParse({ ...validProfile, gender: 'female' }).success === true`, and `gender: 'x'` fails.
- [ ] **Step 2: Run** `npm run test:unit -- profile-gender`; expect failure.
- [ ] **Step 3: Implement.** Add `gender` to the schema (optional, from `GENDERS`), write it to `profiles_private.gender` next to the phone write at `lib/actions/profile.ts:30-32`, read it in `getMyProfile`, and add a shadcn `Select` to the form. Level is not part of this form.
- [ ] **Step 4: Run** `npm run test:unit` and `npx tsc --noEmit`; expect pass. Manually save the profile with a gender and reload.
- [ ] **Step 5: Commit** `git commit -m "feat: members can set their own gender"` (after `git add lib components tests`).

---

## Self-review

- **Spec coverage:** data model (Tasks 1–3), authorization and no-leak (Tasks 1, 3 tests), resolution rules and unrated weight (Tasks 4–5), host UI and permanent member level (Tasks 5, 7), guest gender required at check-in (Task 6), member self-edit of gender (Task 8), type regeneration (Task 4). The spec's open items on `participants` select exposure and the host-only view are resolved by `guest_attributes` (see Deviations).
- **Type consistency:** `PlayerAttributes`, `resolvePlayerAttributes`, `checkInBlockedReason`, `getRosterAttributes`, and the three action names are defined in Task 5 and used unchanged in Tasks 6–7.
- **Known soft spot:** Task 6 has no automated test for the action itself because actions in this repo are not unit-tested; the rule is covered through the pure function and a manual check.
