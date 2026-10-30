# WhatsApp Share + Operational Dashboard Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give hosts a per-session actions menu (edit, cancel, copy a WhatsApp-ready recap) on both `/dashboard` and `/sessions/[id]/manage`, backed by two new fields (`sessions.price`, `participants.paid_at`) and a pure text formatter that reproduces the community's existing WhatsApp recap format.

**Architecture:** Two additive migrations add `price` (sessions) and `paid_at` (participants, mirroring the existing `checked_in_at` column-grant pattern). A pure formatter (`lib/format/whatsapp-share.ts`) turns a session + roster into the recap string. New Server Actions (`updateSession`, `cancelSession`, `getSessionShareText`, `setPaid`) do direct RLS-gated `.update()`s — no new RPCs, since none of this is a capacity-racing decision. A new `SessionActionsMenu` client component wraps the existing `SessionForm` (extended for edit mode) and the new actions, and gets dropped into the two existing pages that already list a host's sessions.

**Tech Stack:** Next.js App Router, Supabase (Postgres, RLS), zod, react-hook-form, shadcn/ui (`DropdownMenu`, `Dialog`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-whatsapp-share-operational-dashboard-design.md`

## Global Constraints

- No RPCs for anything in this plan — `updateSession`/`cancelSession` rely on the existing column-unrestricted `sessions_update_host` RLS policy; `setPaid` mirrors `setCheckedIn`'s direct-UPDATE-plus-column-grant pattern. Registration/waitlist RPCs are untouched.
- `courtCount` is never written by `updateSession` and never rendered in the edit form — courts stay reconciled through the existing `CourtPanel` add/delete controls only.
- The WhatsApp text is built server-side (inside a Server Action), so all date/time formatting in `lib/format/whatsapp-share.ts` must use an explicit `timeZone: "Asia/Jakarta"` — the server process runs in UTC (see `lib/actions/sessions.ts`'s existing comment on `createSession`), unlike the browser-rendered `toLocaleString()` calls elsewhere in this codebase.
- Indonesian time must render with a colon (`09:00`), not a dot — use `Intl.DateTimeFormat("en-GB", ...)` for the time portion, not `"id-ID"` (verified: `id-ID` renders `09.00`).
- Every new Server Action returns `ActionResult<T>` via `ok`/`fail`/`failFromZod` from `lib/actions/result.ts` — no new error shape.
- Regenerate `types/supabase.ts` with `npx supabase gen types typescript --local > types/supabase.ts` immediately after both migrations, before writing any code that reads the new columns.

---

### Task 1: Migration — `sessions.price`

**Files:**
- Create: `supabase/migrations/20260917000005_session_price.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `public.sessions.price integer null` — Task 4 reads/writes this column by name.

- [ ] **Step 1: Write the migration**

```sql
-- WhatsApp share text includes an optional per-session fee (see
-- docs/superpowers/specs/2026-09-17-whatsapp-share-operational-dashboard-design.md).
-- Nullable and integer: Rupiah has no subunit in casual use, and a session
-- with no price set should omit the fee line entirely rather than show 0.
alter table public.sessions
  add column price integer check (price >= 0);
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db reset`
Expected: migrations replay cleanly, ending with the seed script; no errors mentioning `20260917000005`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260917000005_session_price.sql
git commit -m "feat(db): add nullable sessions.price column"
```

---

### Task 2: Migration — `participants.paid_at`

**Files:**
- Create: `supabase/migrations/20260917000006_participant_paid_at.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `public.participants.paid_at timestamptz null`, grantable via `UPDATE (paid_at)` to `authenticated`. Task 6 reads/writes this column by name.

- [ ] **Step 1: Write the migration**

```sql
-- Manual payment-status marker for the WhatsApp share text's checkmark (see
-- docs/superpowers/specs/2026-09-17-whatsapp-share-operational-dashboard-design.md).
-- Mirrors the checked_in_at column exactly -- a nullable timestamp, not a
-- boolean/enum, toggled by a direct column-level grant rather than a
-- SECURITY DEFINER RPC. Safe for the same reason checked_in_at is:
-- participants_update_host RLS already scopes the row to hosts of that
-- session, and marking someone paid isn't a capacity-racing decision the
-- way registration status is (CLAUDE.md Sec 3 rule 1 only requires the
-- RPC/trigger treatment for registration and waitlist promotion).
alter table public.participants
  add column paid_at timestamptz;

grant update (paid_at) on public.participants to authenticated;
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db reset`
Expected: migrations replay cleanly, ending with the seed script; no errors mentioning `20260917000006`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260917000006_participant_paid_at.sql
git commit -m "feat(db): add participants.paid_at with column-scoped host grant"
```

---

### Task 3: Regenerate generated types

**Files:**
- Modify: `types/supabase.ts`

**Interfaces:**
- Consumes: the schema produced by Tasks 1-2.
- Produces: `Database["public"]["Tables"]["sessions"]["Row"]["price"]` and `Database["public"]["Tables"]["participants"]["Row"]["paid_at"]`, both `number | null` / `string | null` respectively — every later task that touches these columns relies on the regenerated file compiling.

- [ ] **Step 1: Regenerate**

Run: `npx supabase gen types typescript --local > types/supabase.ts`

- [ ] **Step 2: Verify the new fields are present**

Run: `grep -n "price\|paid_at" types/supabase.ts`
Expected: both `price: number | null` (under the `sessions` table) and `paid_at: string | null` (under `participants`) appear, each in `Row`, `Insert`, and `Update`.

- [ ] **Step 3: Commit**

```bash
git add types/supabase.ts
git commit -m "chore: regenerate types for sessions.price and participants.paid_at"
```

---

### Task 4: Session price — validation, DAL, `createSession`

**Files:**
- Modify: `lib/validation/session.ts`
- Modify: `lib/dal/sessions.ts`
- Modify: `lib/actions/sessions.ts:38-57` (`createSession`'s insert)
- Modify: `tests/unit/validation.test.ts` (the `sessionSchema` block, `tests/unit/validation.test.ts:155-247`)

**Interfaces:**
- Consumes: `Database["public"]["Enums"]`/`Tables` from Task 3.
- Produces: `SessionInput.price: number | null`, `HostedSession.price: number | null` / `.description: string | null` / `.locationUrl: string | null` — Task 8 (`SessionForm`) and Task 7 (`updateSession`/`getSessionShareText`) both consume these exact fields.

`description` and `location_url` are added to `HostedSession` in this task too, even though the design spec only called out `price`: the edit form (Task 8/9) needs the *full* editable field set as initial values, or saving an edited session would silently blank out its description/map link on every edit (those fields aren't in `HostedSession` today). This was found while planning Task 9, not a scope change — same columns `createSession` already writes, just not previously read back.

- [ ] **Step 1: Write the failing test**

Add to the `describe("sessionSchema", ...)` block in `tests/unit/validation.test.ts` (right after the existing `valid` fixture, which needs a `price: ""` key added so it keeps matching the schema's required-key shape used by every other optional field in this schema):

```ts
// tests/unit/validation.test.ts — inside describe("sessionSchema")
// Add `price: ""` to the existing `valid` object:
const valid = {
  title: "Friday Night Badminton",
  description: "",
  startsAt: "2026-10-02T19:00",
  endsAt: "2026-10-02T22:00",
  location: "GOR Jakarta Barat",
  locationUrl: "",
  courtCount: "4",
  maxParticipants: "16",
  waitlistCapacity: "4",
  registrationState: "open",
  status: "scheduled",
  price: "",
};
```

Then add new cases anywhere inside the same `describe` block:

```ts
it("treats a blank price as null", () => {
  const result = sessionSchema.safeParse(valid);
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.price).toBeNull();
});

it("coerces a numeric price string", () => {
  const result = sessionSchema.safeParse({ ...valid, price: "45000" });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.price).toBe(45000);
});

it("rejects a negative price", () => {
  expect(sessionSchema.safeParse({ ...valid, price: "-1" }).success).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/validation.test.ts -t "price"`
Expected: FAIL — `sessionSchema` has no `price` key yet, so `result.data.price` is `undefined`, not `null`/`45000`.

- [ ] **Step 3: Add `price` to `sessionSchema`**

In `lib/validation/session.ts`, add a new const next to `optionalText`/`optionalUrl` (after `optionalUrl`, before `sessionSchema`):

```ts
const optionalPrice = z
  .coerce.number()
  .int()
  .min(0, "Cannot be negative")
  .max(10_000_000, "That can't be right")
  .or(z.literal(""))
  .or(z.null())
  .transform((value) => (value === "" || value === null ? null : value));
```

Add `price: optionalPrice,` to the `sessionSchema` object, right after `locationUrl: optionalUrl,`:

```ts
export const sessionSchema = z
  .object({
    title: z.string().trim().min(3, "Give the session a title").max(120, "Title is too long"),
    description: optionalText,
    startsAt: z.string().min(1, "Pick a start time"),
    endsAt: z.string().min(1, "Pick an end time"),
    location: z.string().trim().min(3, "Where is it?").max(200, "Location is too long"),
    locationUrl: optionalUrl,
    price: optionalPrice,
    courtCount: z.coerce.number().int().min(1, "At least one court").max(20, "That is a lot of courts"),
    maxParticipants: z.coerce.number().int().min(1, "At least one player").max(200, "That is a lot of players"),
    waitlistCapacity: z.coerce.number().int().min(0, "Cannot be negative").max(200, "That is a long waitlist"),
    registrationState: z.enum(["closed", "open"]),
    status: z.enum(["draft", "scheduled"]),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "End time must be after the start time",
    path: ["endsAt"],
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/validation.test.ts -t "price"`
Expected: PASS (3 new tests)

- [ ] **Step 5: Run the full validation suite to check for regressions**

Run: `npx vitest run tests/unit/validation.test.ts`
Expected: PASS — the pre-existing `sessionSchema` tests still pass with `price: ""` added to `valid`.

- [ ] **Step 6: Extend `HostedSession` in `lib/dal/sessions.ts`**

Replace the whole `HostedSession`/`COLUMNS`/`Row`/`toHostedSession` block (lines 9-51) with:

```ts
export type HostedSession = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  location: string;
  locationUrl: string | null;
  maxParticipants: number;
  waitlistCapacity: number;
  courtCount: number;
  price: number | null;
  status: SessionStatus;
  registrationState: "closed" | "open";
};

const COLUMNS =
  "id, title, description, starts_at, ends_at, location, location_url, max_participants, waitlist_capacity, court_count, price, status, registration_state";

type Row = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string;
  location_url: string | null;
  max_participants: number;
  waitlist_capacity: number;
  court_count: number;
  price: number | null;
  status: SessionStatus;
  registration_state: "closed" | "open";
};

function toHostedSession(row: Row): HostedSession {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    locationUrl: row.location_url,
    maxParticipants: row.max_participants,
    waitlistCapacity: row.waitlist_capacity,
    courtCount: row.court_count,
    price: row.price,
    status: row.status,
    registrationState: row.registration_state,
  };
}
```

(`listMyHostedSessions` and `getHostSession` below this block already spread `${COLUMNS}, session_hosts!inner(user_id)` and call `toHostedSession` — neither needs to change.)

- [ ] **Step 7: Write price into `createSession`'s insert**

In `lib/actions/sessions.ts`, in `createSession`'s `.insert({...})` call (around line 40), add `price: values.price,` right after `location_url: values.locationUrl,`:

```ts
    .insert({
      title: values.title,
      description: values.description,
      starts_at: values.startsAt,
      ends_at: values.endsAt,
      location: values.location,
      location_url: values.locationUrl,
      price: values.price,
      court_count: values.courtCount,
      max_participants: values.maxParticipants,
      waitlist_capacity: values.waitlistCapacity,
      registration_state: values.registrationState,
      status: values.status,
      created_by: user.id,
    })
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `toHostedSession`'s callers, which just spread the same `COLUMNS` string, still line up.)

- [ ] **Step 9: Commit**

```bash
git add lib/validation/session.ts lib/dal/sessions.ts lib/actions/sessions.ts tests/unit/validation.test.ts
git commit -m "feat: add price field to session schema, DAL, and creation"
```

---

### Task 5: WhatsApp text formatter

**Files:**
- Create: `lib/format/whatsapp-share.ts`
- Test: `tests/unit/whatsapp-share.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no project imports beyond a type-only `Database` import for the status enum).
- Produces: `buildWhatsAppShareText(session: ShareSession, roster: ShareParticipant[]): string` — Task 7's `getSessionShareText` action imports this exact signature from `@/lib/format/whatsapp-share`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/whatsapp-share.test.ts
import { describe, expect, it } from "vitest";
import { buildWhatsAppShareText } from "@/lib/format/whatsapp-share";

// 2026-09-19T02:00Z is 09:00 WIB (Asia/Jakarta, UTC+7) on a Saturday.
const session = {
  title: "Friday Night Badminton",
  startsAt: "2026-09-19T02:00:00.000Z",
  endsAt: "2026-09-19T04:00:00.000Z",
  location: "SBM Sport Club Citra",
  courtCount: 3,
  price: 45000 as number | null,
};

describe("buildWhatsAppShareText", () => {
  it("formats the date/time/location/courts/price header", () => {
    const lines = buildWhatsAppShareText(session, []).split("\n");
    expect(lines[0]).toBe("SABTU 19 SEPTEMBER");
    expect(lines[1]).toBe("🕑 09:00 - 11:00");
    expect(lines[2]).toBe("📍SBM Sport Club Citra");
    expect(lines[3]).toBe("LAP. A , B , C");
    expect(lines[4]).toBe("💰45.000");
  });

  it("omits the price line when price is null", () => {
    const text = buildWhatsAppShareText({ ...session, price: null }, []);
    expect(text).not.toContain("💰");
  });

  it("numbers confirmed players under LIST NAMA, marking paid ones with a checkmark", () => {
    const text = buildWhatsAppShareText(session, [
      { fullName: "Selvia", status: "confirmed", paidAt: "2026-09-15T00:00:00.000Z" },
      { fullName: "Yuda", status: "confirmed", paidAt: null },
    ]);
    expect(text).toContain("LIST NAMA\n1. Selvia ✅\n2. Yuda");
  });

  it("numbers waitlisted players under OPEN WL: with no checkmark", () => {
    const text = buildWhatsAppShareText(session, [
      { fullName: "Ichsan", status: "waiting_list", paidAt: null },
      { fullName: "Anton", status: "waiting_list", paidAt: "2026-09-15T00:00:00.000Z" },
    ]);
    expect(text).toContain("OPEN WL:\n1. Ichsan\n2. Anton");
  });

  it("omits the OPEN WL section entirely when there is no waitlist", () => {
    const text = buildWhatsAppShareText(session, [
      { fullName: "Selvia", status: "confirmed", paidAt: null },
    ]);
    expect(text).not.toContain("OPEN WL");
  });

  it("drops cancelled participants from both lists without any special-case filter", () => {
    const text = buildWhatsAppShareText(session, [
      { fullName: "Ghost", status: "cancelled", paidAt: null },
    ]);
    expect(text).not.toContain("Ghost");
  });

  it("generates court letters up to the 20-court cap without wrapping past Z", () => {
    const text = buildWhatsAppShareText({ ...session, courtCount: 20 }, []);
    expect(text.split("\n")[3]).toBe(
      "LAP. A , B , C , D , E , F , G , H , I , J , K , L , M , N , O , P , Q , R , S , T",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/whatsapp-share.test.ts`
Expected: FAIL — `Cannot find module '@/lib/format/whatsapp-share'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/format/whatsapp-share.ts
import type { Database } from "@/types/supabase";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

export type ShareSession = {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  courtCount: number;
  price: number | null;
};

export type ShareParticipant = {
  fullName: string;
  status: ParticipantStatus;
  paidAt: string | null;
};

// This runs inside a Server Action (see getSessionShareText in
// lib/actions/sessions.ts), not the browser -- the server process is UTC on
// Vercel (see createSession's comment in lib/actions/sessions.ts), so an
// implicit-local-zone formatter would render the wrong wall-clock time for
// this Jakarta-based community. Every formatter below pins Asia/Jakarta
// explicitly instead of relying on the runtime's default zone.
const WEEKDAY = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" });
const DAY_MONTH = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
// en-GB, not id-ID: id-ID renders a dot separator ("09.00"); the source
// format this reproduces uses a colon ("09:00").
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});
const PRICE = new Intl.NumberFormat("id-ID");

function courtLetters(count: number): string {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index)).join(" , ");
}

function numbered(entries: ShareParticipant[], withCheckmark: boolean): string[] {
  return entries.map((entry, index) => {
    const check = withCheckmark && entry.paidAt !== null ? " ✅" : "";
    return `${index + 1}. ${entry.fullName}${check}`;
  });
}

export function buildWhatsAppShareText(session: ShareSession, roster: ShareParticipant[]): string {
  const starts = new Date(session.startsAt);
  const ends = new Date(session.endsAt);

  const lines: string[] = [
    `${WEEKDAY.format(starts)} ${DAY_MONTH.format(starts)}`.toUpperCase(),
    `🕑 ${TIME.format(starts)} - ${TIME.format(ends)}`,
    `📍${session.location}`,
    `LAP. ${courtLetters(session.courtCount)}`,
  ];

  if (session.price !== null) {
    lines.push(`💰${PRICE.format(session.price)}`);
  }

  lines.push("", "LIST NAMA");
  // Filtering to exactly "confirmed"/"waiting_list" here is what excludes
  // cancelled rows -- no separate cancelled-status branch needed.
  lines.push(...numbered(roster.filter((entry) => entry.status === "confirmed"), true));

  const waiting = roster.filter((entry) => entry.status === "waiting_list");
  if (waiting.length > 0) {
    lines.push("", "OPEN WL:");
    lines.push(...numbered(waiting, false));
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/whatsapp-share.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/format/whatsapp-share.ts tests/unit/whatsapp-share.test.ts
git commit -m "feat: add WhatsApp share text formatter"
```

---

### Task 6: `paid_at` — validation, DAL, `setPaid` action

**Files:**
- Modify: `lib/validation/participants.ts`
- Modify: `lib/dal/participants.ts` (`RosterEntry` type and `listRoster`, lines 39-51 and 184-218)
- Modify: `lib/actions/participants.ts`
- Modify: `tests/unit/validation.test.ts` (add a `setPaidSchema` block after the existing `setCheckedInSchema` block, `tests/unit/validation.test.ts:248-271`)

**Interfaces:**
- Consumes: `participants.paid_at` from Task 2/3.
- Produces: `RosterEntry.paidAt: string | null`, `setPaid(participantId: string, sessionId: string, paid: boolean): Promise<ActionResult<null>>` — Task 7's `getSessionShareText` reads `RosterEntry.paidAt`; Task 10 (`roster-table.tsx`) calls `setPaid`.

- [ ] **Step 1: Write the failing test**

Add after the `describe("setCheckedInSchema", ...)` block in `tests/unit/validation.test.ts`:

```ts
describe("setPaidSchema", () => {
  it("accepts a valid payload", () => {
    const result = setPaidSchema.safeParse({
      participantId: "11111111-1111-1111-1111-111111111111",
      sessionId: "22222222-2222-2222-2222-222222222222",
      paid: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid participantId", () => {
    const result = setPaidSchema.safeParse({
      participantId: "not-a-uuid",
      sessionId: "22222222-2222-2222-2222-222222222222",
      paid: true,
    });
    expect(result.success).toBe(false);
  });
});
```

Add `setPaidSchema` to the existing import at the top of the file:

```ts
import { setCheckedInSchema } from "@/lib/validation/participants";
```
becomes
```ts
import { setCheckedInSchema, setPaidSchema } from "@/lib/validation/participants";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/validation.test.ts -t "setPaidSchema"`
Expected: FAIL — `setPaidSchema` is not exported yet.

- [ ] **Step 3: Add `setPaidSchema`**

In `lib/validation/participants.ts`, add after `setCheckedInSchema`/`SetCheckedInInput`:

```ts
export const setPaidSchema = z.object({
  participantId: z.uuid(),
  sessionId: z.uuid(),
  paid: z.boolean(),
});

export type SetPaidInput = z.infer<typeof setPaidSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/validation.test.ts -t "setPaidSchema"`
Expected: PASS (2 tests)

- [ ] **Step 5: Add `paidAt` to `RosterEntry` and `listRoster`**

In `lib/dal/participants.ts`, add `paidAt: string | null;` to the `RosterEntry` type (after `checkedInAt: string | null;`, line 44):

```ts
export type RosterEntry = {
  id: string;
  userId: string | null;
  status: ParticipantStatus;
  registeredAt: string;
  checkedInAt: string | null;
  paidAt: string | null;
  addedBy: string | null;
  consentedAt: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  guestPhone: string | null;
};
```

In `listRoster`, add `paid_at` to the `.select(...)` column list and `paidAt: row.paid_at,` to the returned object:

```ts
  const { data, error } = await supabase
    .from("participants")
    .select(
      "id, user_id, status, registered_at, checked_in_at, paid_at, added_by, consented_at, guest_name, guest_phone, profiles!participants_user_id_fkey(full_name, avatar_url)",
    )
    .eq("session_id", sessionId)
    .order("registered_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    registeredAt: row.registered_at,
    checkedInAt: row.checked_in_at,
    paidAt: row.paid_at,
    addedBy: row.added_by,
    consentedAt: row.consented_at,
    fullName: row.profiles?.full_name ?? row.guest_name,
    avatarUrl: row.profiles?.avatar_url ?? null,
    isGuest: row.guest_name !== null,
    guestPhone: row.guest_phone,
  }));
```

- [ ] **Step 6: Add the `setPaid` action**

In `lib/actions/participants.ts`, add the import and the action (after `setCheckedIn`):

```ts
import {
  hostAddParticipantSchema,
  searchMembersSchema,
  setCheckedInSchema,
  setPaidSchema,
  setParticipantStatusSchema,
} from "@/lib/validation/participants";
```

```ts
// Same reasoning as setCheckedIn immediately above: not a capacity-racing
// decision, so a direct UPDATE gated by participants_update_host's row scope
// plus the paid_at column grant (20260917000006) is enough -- no RPC.
export async function setPaid(
  participantId: string,
  sessionId: string,
  paid: boolean,
): Promise<ActionResult<null>> {
  const parsed = setPaidSchema.safeParse({ participantId, sessionId, paid });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("participants")
    .update({ paid_at: parsed.data.paid ? new Date().toISOString() : null })
    .eq("id", parsed.data.participantId)
    .eq("session_id", parsed.data.sessionId);

  if (error) return fail("unknown", "Could not update payment status.");

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/validation/participants.ts lib/dal/participants.ts lib/actions/participants.ts tests/unit/validation.test.ts
git commit -m "feat: add paid_at to roster DAL and setPaid action"
```

---

### Task 7: `updateSession`, `cancelSession`, `getSessionShareText` actions

**Files:**
- Modify: `lib/validation/session.ts`
- Modify: `lib/actions/sessions.ts`
- Modify: `tests/unit/validation.test.ts` (add a `sessionIdSchema` block after the `sessionSchema` block)

**Interfaces:**
- Consumes: `SessionInput`/`sessionSchema` (Task 4), `buildWhatsAppShareText` (Task 5), `RosterEntry.paidAt` (Task 6), `getHostSession`/`listRoster` (existing DAL).
- Produces: `updateSession(id: string, input: SessionInput): Promise<ActionResult<null>>`, `cancelSession(id: string): Promise<ActionResult<null>>`, `getSessionShareText(sessionId: string): Promise<ActionResult<{ text: string }>>` — Task 8 (`SessionForm`) calls `updateSession`; Task 9 (`SessionActionsMenu`) calls all three.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/validation.test.ts`, right after the `describe("sessionSchema", ...)` block, and add `sessionIdSchema` to the existing `sessionSchema`/`isZonedInstant` import:

```ts
import { sessionSchema, sessionIdSchema, isZonedInstant } from "@/lib/validation/session";
```

```ts
describe("sessionIdSchema", () => {
  it("accepts a valid uuid", () => {
    expect(sessionIdSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111" }).success).toBe(true);
  });

  it("rejects a non-uuid", () => {
    expect(sessionIdSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/validation.test.ts -t "sessionIdSchema"`
Expected: FAIL — `sessionIdSchema` is not exported yet.

- [ ] **Step 3: Add `sessionIdSchema`**

In `lib/validation/session.ts`, add near the top, after the `optionalPrice` const (or anywhere before it's used — placement doesn't matter, this schema is independent of `sessionSchema`):

```ts
export const sessionIdSchema = z.object({ id: z.uuid() });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/validation.test.ts -t "sessionIdSchema"`
Expected: PASS (2 tests)

- [ ] **Step 5: Add `updateSession`, `cancelSession`, `getSessionShareText`**

In `lib/actions/sessions.ts`, add the new imports at the top:

```ts
import { sessionSchema, sessionIdSchema, isZonedInstant, type SessionInput } from "@/lib/validation/session";
import { getHostSession } from "@/lib/dal/sessions";
import { listRoster } from "@/lib/dal/participants";
import { buildWhatsAppShareText } from "@/lib/format/whatsapp-share";
```

(`sessionSchema`/`isZonedInstant`/`SessionInput` are already imported by `createSession` — extend that existing import line with `sessionIdSchema` rather than duplicating it.)

Append after `createSession`:

```ts
// Same RLS as createSession (sessions_update_host is column-unrestricted),
// so a plain UPDATE is enough -- no RPC. courtCount is deliberately never
// written here even though it's part of SessionInput: courts are reconciled
// through the manage page's add/delete controls (guard_court_delete
// trigger), and writing court_count here without touching the courts table
// would desync the two.
export async function updateSession(id: string, input: SessionInput): Promise<ActionResult<null>> {
  const idParsed = sessionIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid session id.");

  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const values = parsed.data;

  const zoneless = (["startsAt", "endsAt"] as const).filter((key) => !isZonedInstant(values[key]));
  if (zoneless.length > 0) {
    return fail(
      "validation",
      "Please pick a start and end time.",
      Object.fromEntries(zoneless.map((key) => [key, ["Missing time zone"]])),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("sessions")
    .update({
      title: values.title,
      description: values.description,
      starts_at: values.startsAt,
      ends_at: values.endsAt,
      location: values.location,
      location_url: values.locationUrl,
      price: values.price,
      max_participants: values.maxParticipants,
      waitlist_capacity: values.waitlistCapacity,
      registration_state: values.registrationState,
      status: values.status,
    })
    .eq("id", idParsed.data.id);

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the session.");
  }

  revalidatePath(`/sessions/${idParsed.data.id}/manage`);
  revalidatePath("/dashboard");
  revalidatePath("/sessions");
  return ok(null);
}

// A distinct action rather than a value in sessionSchema's status enum
// (which only offers draft/scheduled -- see that schema's comment) so
// ending a session stays a deliberate, separately-confirmed action instead
// of a dropdown option a host could pick by accident while editing the
// title. sessions_select_public_or_host already excludes 'cancelled' from
// the public list, so no extra visibility change is needed here.
export async function cancelSession(id: string): Promise<ActionResult<null>> {
  const idParsed = sessionIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid session id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  const { error } = await supabase
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", idParsed.data.id);

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not cancel the session.");
  }

  revalidatePath(`/sessions/${idParsed.data.id}/manage`);
  revalidatePath("/dashboard");
  revalidatePath("/sessions");
  return ok(null);
}

// Read-only. getHostSession already scopes to sessions this caller hosts
// (see its comment in lib/dal/sessions.ts) -- returning null there means
// "not a host of this session", surfaced here as not_authorized rather than
// leaking whether the session exists.
export async function getSessionShareText(sessionId: string): Promise<ActionResult<{ text: string }>> {
  const idParsed = sessionIdSchema.safeParse({ id: sessionId });
  if (!idParsed.success) return fail("validation", "Invalid session id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const session = await getHostSession(idParsed.data.id);
  if (!session) return fail("not_authorized");

  const roster = await listRoster(idParsed.data.id);

  const text = buildWhatsAppShareText(
    {
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      location: session.location,
      courtCount: session.courtCount,
      price: session.price,
    },
    roster.map((entry) => ({
      fullName: entry.fullName ?? "Unnamed player",
      status: entry.status,
      paidAt: entry.paidAt,
    })),
  );

  return ok({ text });
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/session.ts lib/actions/sessions.ts tests/unit/validation.test.ts
git commit -m "feat: add updateSession, cancelSession, getSessionShareText actions"
```

---

### Task 8: `SessionForm` edit mode

**Files:**
- Modify: `components/sessions/session-form.tsx`

**Interfaces:**
- Consumes: `updateSession` (Task 7), `SessionInput`/`SessionFormValues` (Task 4).
- Produces: `SessionForm({ sessionId?, initialValues?, onSuccess? })` — Task 9 (`SessionActionsMenu`) renders `<SessionForm sessionId={...} initialValues={...} onSuccess={...} />` inside its edit dialog. `app/(app)/sessions/new/page.tsx`'s existing bare `<SessionForm />` must keep working unchanged.

- [ ] **Step 1: Update imports and props**

In `components/sessions/session-form.tsx`, add `updateSession` to the existing import and add the props type:

```ts
import { createSession, updateSession } from "@/lib/actions/sessions";
```

```ts
export function SessionForm({
  sessionId,
  initialValues,
  onSuccess,
}: {
  sessionId?: string;
  initialValues?: SessionFormValues;
  onSuccess?: () => void;
} = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEditing = sessionId !== undefined;
```

- [ ] **Step 2: Use `initialValues` as the form's default values**

Replace the `useForm` call's `defaultValues`:

```ts
  const form = useForm<SessionFormValues, unknown, SessionInput>({
    resolver: zodResolver(sessionSchema),
    defaultValues: initialValues ?? {
      title: "",
      description: "",
      startsAt: "",
      endsAt: "",
      location: "",
      locationUrl: "",
      price: "",
      courtCount: "4",
      maxParticipants: "16",
      waitlistCapacity: "4",
      registrationState: "closed",
      status: "draft",
    },
  });
```

- [ ] **Step 3: Branch the submit handler**

Replace the whole `onSubmit` definition:

```ts
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      // datetime-local has no zone. Convert HERE, in the browser, where the
      // local zone is the user's own. new Date(...).toISOString() also
      // handles an already-zoned instant (what initialValues.startsAt is,
      // in edit mode, until the picker is touched) as a no-op re-encode.
      const toInstant = (local: string) => new Date(local).toISOString();

      const payload = {
        ...values,
        startsAt: toInstant(values.startsAt),
        endsAt: toInstant(values.endsAt),
      };

      if (isEditing) {
        const result = await updateSession(sessionId, payload);
        if (result.ok) {
          onSuccess?.();
          router.refresh();
          return;
        }
        applyFieldErrors(form, result.fieldErrors);
        form.setError("root", { message: result.message });
        return;
      }

      const result = await createSession(payload);
      if (result.ok) {
        router.push(`/sessions/${result.data.id}/manage`);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      form.setError("root", { message: result.message });
    }),
  );
```

- [ ] **Step 4: Hide `courtCount` and add the `price` field**

Replace the court/capacity grid (the `<div className="grid grid-cols-3 gap-4">` block containing `courtCount`/`maxParticipants`/`waitlistCapacity`):

```tsx
            <div className={isEditing ? "grid grid-cols-2 gap-4" : "grid grid-cols-3 gap-4"}>
              {!isEditing ? (
                <FormField
                  control={form.control}
                  name="courtCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Courts</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="maxParticipants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} value={String(field.value ?? "")} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="waitlistCapacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Waitlist</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} value={String(field.value ?? "")} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price per player (Rp)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="45000" {...field} value={String(field.value ?? "")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

- [ ] **Step 5: Update the submit button label**

Replace the `CardFooter`'s button:

```tsx
          <CardFooter>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save changes" : "Create session"}
            </Button>
          </CardFooter>
```

- [ ] **Step 6: Type-check and confirm the existing create page still compiles**

Run: `npx tsc --noEmit`
Expected: no errors — `app/(app)/sessions/new/page.tsx`'s `<SessionForm />` (no props) still satisfies the new optional-props signature.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, sign in as a host, visit `/sessions/new`, confirm the form still renders Courts/Capacity/Waitlist/Price and creates a session as before (unchanged behavior, price now saved).

- [ ] **Step 8: Commit**

```bash
git add components/sessions/session-form.tsx
git commit -m "feat: add edit mode and price field to SessionForm"
```

---

### Task 9: `SessionActionsMenu`

**Files:**
- Create: `components/sessions/session-actions-menu.tsx`

**Interfaces:**
- Consumes: `HostedSession` (Task 4), `SessionForm` (Task 8), `updateSession`/`cancelSession`/`getSessionShareText` (Task 7).
- Produces: `SessionActionsMenu({ session: HostedSession, showManageLink?: boolean })` — Task 11 renders this on both `/dashboard` and the manage page.

- [ ] **Step 1: Write the component**

```tsx
// components/sessions/session-actions-menu.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SessionForm } from "@/components/sessions/session-form";
import { cancelSession, getSessionShareText } from "@/lib/actions/sessions";
import type { HostedSession } from "@/lib/dal/sessions";

// Editing only makes sense pre-lifecycle -- SessionForm's own status field
// only offers draft/scheduled (see its comment), so a 'live'/'completed'
// session has no valid option to preselect. Cancelling a session that's
// already cancelled/completed is a no-op the menu shouldn't offer.
function canEdit(status: HostedSession["status"]): boolean {
  return status === "draft" || status === "scheduled";
}

function canCancel(status: HostedSession["status"]): boolean {
  return status !== "cancelled" && status !== "completed";
}

export function SessionActionsMenu({
  session,
  showManageLink = true,
}: {
  session: HostedSession;
  showManageLink?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const copyShareText = () =>
    startTransition(async () => {
      const result = await getSessionShareText(session.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.text);
        toast.success("Copied to clipboard");
      } catch {
        toast.error("Could not copy to clipboard");
      }
    });

  const confirmCancel = () =>
    startTransition(async () => {
      const result = await cancelSession(session.id);
      if (result.ok) {
        toast.success("Session cancelled");
        setCancelOpen(false);
      } else {
        toast.error(result.message);
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              copyShareText();
            }}
          >
            Copy WhatsApp text
          </DropdownMenuItem>
          {canEdit(session.status) ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setEditOpen(true);
              }}
            >
              Edit
            </DropdownMenuItem>
          ) : null}
          {showManageLink ? (
            <DropdownMenuItem asChild>
              <Link href={`/sessions/${session.id}/manage`}>Manage</Link>
            </DropdownMenuItem>
          ) : null}
          {canCancel(session.status) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setCancelOpen(true);
                }}
              >
                Cancel session
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit session</DialogTitle>
          </DialogHeader>
          <SessionForm
            sessionId={session.id}
            initialValues={{
              title: session.title,
              description: session.description ?? "",
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              location: session.location,
              locationUrl: session.locationUrl ?? "",
              price: session.price !== null ? String(session.price) : "",
              courtCount: String(session.courtCount),
              maxParticipants: String(session.maxParticipants),
              waitlistCapacity: String(session.waitlistCapacity),
              registrationState: session.registrationState,
              // canEdit(session.status) above guarantees this is 'draft' or
              // 'scheduled' whenever this dialog is reachable.
              status: session.status as "draft" | "scheduled",
            }}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this session?</DialogTitle>
            <DialogDescription>
              This cancels the session for everyone registered. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setCancelOpen(false)}>
              Keep session
            </Button>
            <Button variant="destructive" disabled={pending} onClick={confirmCancel}>
              {pending ? "Cancelling…" : "Cancel session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/sessions/session-actions-menu.tsx
git commit -m "feat: add SessionActionsMenu (copy WhatsApp text, edit, cancel)"
```

---

### Task 10: Paid toggle in `RosterTable`

**Files:**
- Modify: `components/sessions/roster-table.tsx`

**Interfaces:**
- Consumes: `setPaid` (Task 6), `RosterEntry.paidAt` (Task 6, passed in structurally via the existing `entries` prop).
- Produces: nothing new consumed elsewhere — this is a leaf UI change.

- [ ] **Step 1: Add `paidAt` to the local `Entry` type and import `setPaid`**

```ts
import { setCheckedIn, setPaid, setParticipantStatus } from "@/lib/actions/participants";
```

```ts
type Entry = {
  id: string;
  status: ParticipantStatus;
  registeredAt: string;
  checkedInAt: string | null;
  paidAt: string | null;
  addedBy: string | null;
  consentedAt: string | null;
  fullName: string | null;
  isGuest: boolean;
};
```

- [ ] **Step 2: Add the toggle handler**

Right after `toggleCheckedIn`:

```ts
  const togglePaid = (participantId: string, paid: boolean) =>
    startTransition(async () => {
      const result = await setPaid(participantId, sessionId, paid);
      if (result.ok) toast.success(paid ? "Marked paid" : "Payment undone");
      else toast.error(result.message);
    });
```

- [ ] **Step 3: Add the mobile card button**

In the mobile `<li>` card's button group (inside the `entry.status === "confirmed" ? (...) : null` block for check-in, right after the check-in/undo-check-in buttons, still inside the same `<div className="flex flex-wrap gap-2">`), add:

```tsx
              {entry.status === "confirmed" ? (
                entry.paidAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="h-11 flex-1 basis-32"
                    onClick={() => togglePaid(entry.id, false)}
                  >
                    Undo paid
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={pending}
                    className="h-11 flex-1 basis-32"
                    onClick={() => togglePaid(entry.id, true)}
                  >
                    Mark paid
                  </Button>
                )
              ) : null}
```

- [ ] **Step 4: Add the desktop table column**

Add a `<TableHead>Paid</TableHead>` right after `<TableHead>Check-in</TableHead>`:

```tsx
            <TableHead>Check-in</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead className="text-right">Override</TableHead>
```

Add the matching `<TableCell>` right after the check-in `<TableCell>` (before the `Override` cell):

```tsx
              <TableCell>
                {entry.status !== "confirmed" ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : entry.paidAt ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => togglePaid(entry.id, false)}>
                    Undo paid
                  </Button>
                ) : (
                  <Button size="sm" disabled={pending} onClick={() => togglePaid(entry.id, true)}>
                    Mark paid
                  </Button>
                )}
              </TableCell>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open a session's manage page as its host, confirm both the mobile card layout (narrow viewport) and the desktop table show a working Mark paid / Undo paid control for confirmed participants only.

- [ ] **Step 7: Commit**

```bash
git add components/sessions/roster-table.tsx
git commit -m "feat: add paid toggle to roster table"
```

---

### Task 11: Wire `SessionActionsMenu` into the dashboard and manage page

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/sessions/[id]/manage/page.tsx`

**Interfaces:**
- Consumes: `SessionActionsMenu` (Task 9).
- Produces: nothing new consumed elsewhere — terminal wiring task.

- [ ] **Step 1: Add the menu to the dashboard's hosted-session cards**

In `app/(app)/dashboard/page.tsx`, add the import:

```ts
import { SessionActionsMenu } from "@/components/sessions/session-actions-menu";
```

Change the "Sessions you host" `CardHeader` to put the menu next to the title:

```tsx
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>
                      <Link href={`/sessions/${session.id}/manage`}>{session.title}</Link>
                    </CardTitle>
                    <SessionActionsMenu session={session} />
                  </div>
                  <CardDescription>
                    {new Date(session.startsAt).toLocaleString()} · {session.location} ·{" "}
                    {session.status} · registration {session.registrationState}
                  </CardDescription>
                </CardHeader>
```

- [ ] **Step 2: Add the menu to the manage page header**

In `app/(app)/sessions/[id]/manage/page.tsx`, add the import:

```ts
import { SessionActionsMenu } from "@/components/sessions/session-actions-menu";
```

Change the `<header>` block to put the menu next to the title, with `showManageLink={false}` (this page *is* the manage page):

```tsx
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{session.title}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(session.startsAt).toLocaleString()} · {session.location}
          </p>
        </div>
        <SessionActionsMenu session={session} showManageLink={false} />
      </header>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification (full flow)**

Run: `npm run dev`, sign in as a host with at least one hosted session, then:
1. On `/dashboard`, open the Actions menu on a hosted session card, click Copy WhatsApp text, paste it somewhere — confirm it matches the format (date/time/location/courts/price header, `LIST NAMA`, `OPEN WL:` if there's a waitlist, `✅` on paid confirmed players).
2. Click Edit, change the title and price, save — confirm the card updates and the change persists on reload.
3. On the manage page for the same session, mark a participant paid, copy the WhatsApp text again, confirm the checkmark appears.
4. Click Cancel session, confirm the dialog, confirm the session disappears from `/sessions` (the public list) and its status shows cancelled.
5. Confirm `courtCount` was never touched by any of the above — court count and the courts listed in `CourtPanel` are unchanged throughout.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all suites green (including the new `whatsapp-share.test.ts` and the extended `validation.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" "app/(app)/sessions/[id]/manage/page.tsx"
git commit -m "feat: wire SessionActionsMenu into dashboard and manage page"
```

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec maps to a task — schema (Tasks 1-2), types (Task 3), `sessionSchema`/DAL price (Task 4), formatter (Task 5), `paid_at`/`setPaid` (Task 6), the three new Server Actions (Task 7), `SessionForm` edit mode (Task 8), `SessionActionsMenu` (Task 9), roster paid toggle (Task 10), wiring (Task 11).
- **Scope correction found during planning:** `HostedSession` needed `description`/`locationUrl` added, not just `price` — otherwise editing a session would silently null out its description and map link (those fields weren't previously read back from the DB into `HostedSession`). Folded into Task 4 with an explanatory note rather than left as a gap.
- **Type consistency:** `setPaid(participantId, sessionId, paid)` (Task 6) matches its call site in Task 10 exactly; `buildWhatsAppShareText(session: ShareSession, roster: ShareParticipant[])` (Task 5) matches its call in `getSessionShareText` (Task 7) field-for-field; `SessionActionsMenu`'s `session: HostedSession` matches what both call sites in Task 11 already have in scope (`HostedSession[]` from `listMyHostedSessions`/`getHostSession`).
- **No placeholders:** every step has literal code; no "add error handling" or "similar to Task N" shortcuts.
