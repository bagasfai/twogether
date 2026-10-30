# Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `public.announcements` schema up end to end — host and admin write surfaces, and read surfaces on the public session page, the marketing landing page, and the member dashboard.

**Architecture:** A new DAL module (`lib/dal/announcements.ts`) with five read functions split by which Supabase client they need (anon-safe `createPublicClient()` for `(marketing)` routes, authenticated `createClient()` for `(app)` routes). One validation schema and two Server Actions (`createAnnouncement`, `updateAnnouncement`) shared by both the host and admin write UIs — RLS alone discriminates who can write what, since `is_session_host()` already OR's in `is_admin()`. Two new UI components (a create/edit dialog, a list wrapper) reused by the manage and admin pages; the three read-only surfaces render their own inline markup.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), TypeScript strict, Zod, shadcn/ui, next-intl (for the `(marketing)` route group only).

**Spec:** `docs/superpowers/specs/2026-09-22-announcements-design.md`

## Global Constraints

- No migration, no `types/supabase.ts` regeneration — schema and RLS already exist.
- No draft/publish workflow — every announcement is published immediately (`published_at = new Date().toISOString()` at insert time).
- No delete, no unpublish — create and edit only.
- One generic `createAnnouncement`/`updateAnnouncement` action pair serves both the host and admin write UIs. RLS is the authorization layer; do not add app-level role branching on top of it.
- `(app)` route group pages (manage, admin, dashboard) use plain English strings, no next-intl — matches every existing page in that group.
- `(marketing)` route group pages (landing, session detail) use next-intl — add new translation keys under an `announcements` namespace in both `messages/en.json` and `messages/id.json`.

---

### Task 1: Announcement validation schema

**Files:**
- Create: `lib/validation/announcement.ts`
- Modify: `tests/unit/validation.test.ts` — this repo keeps all zod-schema unit tests in this one shared file (see its existing imports/describes), not one file per schema. Do not create a separate test file.

**Interfaces:**
- Produces: `announcementSchema: ZodObject<{ title: string; body: string }>`, `type AnnouncementInput = z.infer<typeof announcementSchema>`, `createAnnouncementSchema = announcementSchema.extend({ sessionId: string | null })`, `announcementIdSchema: ZodObject<{ id: string }>` (uuid-validated).

- [ ] **Step 1: Write the failing test**

Add this import near the top of `tests/unit/validation.test.ts`, alongside the existing schema imports:

```ts
import { announcementSchema } from "@/lib/validation/announcement";
```

Add this `describe` block at the end of the file:

```ts
describe("announcementSchema", () => {
  const valid = { title: "Court fees going up", body: "Heads up, rates increase next month." };

  it("accepts a valid announcement", () => {
    expect(announcementSchema.safeParse(valid).success).toBe(true);
  });

  it("trims whitespace from title and body", () => {
    const result = announcementSchema.safeParse({ title: "  Hello  ", body: "  World  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Hello");
      expect(result.data.body).toBe("World");
    }
  });

  it("rejects an empty title", () => {
    expect(announcementSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(announcementSchema.safeParse({ ...valid, body: "" }).success).toBe(false);
  });

  it("rejects a title over 200 characters", () => {
    expect(announcementSchema.safeParse({ ...valid, title: "a".repeat(201) }).success).toBe(false);
  });

  it("accepts a title of exactly 200 characters", () => {
    expect(announcementSchema.safeParse({ ...valid, title: "a".repeat(200) }).success).toBe(true);
  });

  it("rejects a body over 2000 characters", () => {
    expect(announcementSchema.safeParse({ ...valid, body: "a".repeat(2001) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/validation.test.ts`
Expected: FAIL — `lib/validation/announcement.ts` does not exist yet (module resolution error).

- [ ] **Step 3: Write the implementation**

Create `lib/validation/announcement.ts`:

```ts
import { z } from "zod";

export const announcementSchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(200, "Title is too long"),
  body: z.string().trim().min(1, "Write something").max(2000, "That's too long"),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;

// Only createAnnouncement needs sessionId -- null means community-wide,
// a uuid means scoped to that session (see the design spec's Schema
// section for the RLS this maps to).
export const createAnnouncementSchema = announcementSchema.extend({
  sessionId: z.union([z.uuid(), z.null()]),
});

export const announcementIdSchema = z.object({ id: z.uuid() });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/validation.test.ts`
Expected: PASS, all `announcementSchema` cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/announcement.ts tests/unit/validation.test.ts
git commit -m "feat: add announcement validation schema"
```

---

### Task 2: Announcements DAL module

**Files:**
- Create: `lib/dal/announcements.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `createPublicClient` (`@/lib/supabase/public`), `getCurrentUser` (`@/lib/dal/user`), `getHostSession` (`@/lib/dal/sessions`).
- Produces: `type AnnouncementRow = { id: string; sessionId: string | null; title: string; body: string; publishedAt: string; createdAt: string }`, and five async functions: `listPublicCommunityAnnouncements(limit?: number): Promise<AnnouncementRow[]>`, `listPublicSessionAnnouncements(sessionId: string): Promise<AnnouncementRow[]>`, `listMyAnnouncementsFeed(): Promise<AnnouncementRow[]>`, `listHostAnnouncements(sessionId: string): Promise<AnnouncementRow[]>`, `listCommunityAnnouncementsForAdmin(): Promise<AnnouncementRow[]>`.

This is a straight query mirror of existing DAL functions (`getPublicSession`, `listRoster`, `searchAddableMembers`) with no new derivation logic — per the design spec's Testing section, this task has no unit test cycle. Verified by `tsc` here and by the manual end-to-end pass in Task 11.

- [ ] **Step 1: Write the module**

Create `lib/dal/announcements.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentUser } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";

export type AnnouncementRow = {
  id: string;
  sessionId: string | null;
  title: string;
  body: string;
  publishedAt: string;
  createdAt: string;
};

const COLUMNS = "id, session_id, title, body, published_at, created_at";

type Row = {
  id: string;
  session_id: string | null;
  title: string;
  body: string;
  published_at: string | null;
  created_at: string;
};

function toAnnouncementRow(row: Row): AnnouncementRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    body: row.body,
    // Every announcement created through this app is published immediately
    // (createAnnouncement always sets published_at) -- it's only nullable in
    // the schema for a draft state this app never produces. Every query
    // below is already scoped (directly, or via RLS) to rows the caller may
    // read, so this cast is safe rather than defensive.
    publishedAt: row.published_at as string,
    createdAt: row.created_at,
  };
}

// Anon-safe: no auth check, uses the anon-key client so a route calling this
// stays statically cacheable. announcements_select grants anon SELECT
// directly (unlike participants), so no client-fetch/API-route indirection
// is needed here the way RegisteredParticipants needs one.
export async function listPublicCommunityAnnouncements(limit = 5): Promise<AnnouncementRow[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .is("session_id", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}

// Anon-safe. RLS's published_at is not null + session_is_public(session_id)
// disjunct does the real filtering; this query doesn't need to duplicate
// it, same as getPublicSession not re-checking session visibility itself.
export async function listPublicSessionAnnouncements(sessionId: string): Promise<AnnouncementRow[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .eq("session_id", sessionId)
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}

// Community-wide announcements UNION announcements for sessions the caller
// is currently registered in (non-cancelled, upcoming) -- the same session-id
// set listMyUpcomingRegistrations would return, fetched directly here rather
// than importing that function, since only the session ids are needed.
export async function listMyAnnouncementsFeed(): Promise<AnnouncementRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data: registrations, error: registrationsError } = await supabase
    .from("participants")
    .select("session_id, sessions!inner(starts_at)")
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .gte("sessions.starts_at", new Date().toISOString());

  if (registrationsError) throw registrationsError;

  const sessionIds = (registrations ?? []).map((row) => row.session_id);

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .or(
      sessionIds.length > 0
        ? `session_id.is.null,session_id.in.(${sessionIds.join(",")})`
        : "session_id.is.null",
    )
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}

// getHostSession scopes to sessions this caller hosts (or is admin of, via
// is_session_host's own is_admin() OR) -- same convention as
// searchAddableMembers, returning [] rather than throwing for "not a host
// of this session".
export async function listHostAnnouncements(sessionId: string): Promise<AnnouncementRow[]> {
  const session = await getHostSession(sessionId);
  if (!session) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .eq("session_id", sessionId)
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}

// The admin page itself already gates with requireAdmin; this follows the
// DAL convention of every function checking auth at the source rather than
// trusting the caller (see listRoster's comment on the same convention).
export async function listCommunityAnnouncementsForAdmin(): Promise<AnnouncementRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .is("session_id", null)
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/dal/announcements.ts
git commit -m "feat: add announcements DAL module"
```

---

### Task 3: Announcement Server Actions

**Files:**
- Create: `lib/actions/announcements.ts`

**Interfaces:**
- Consumes: `announcementSchema`, `createAnnouncementSchema`, `announcementIdSchema`, `type AnnouncementInput` (Task 1, `@/lib/validation/announcement`); `fail`, `failFromZod`, `ok`, `type ActionResult` (`@/lib/actions/result`); `getCurrentUser` (`@/lib/dal/user`); `createClient` (`@/lib/supabase/server`).
- Produces: `createAnnouncement(input: AnnouncementInput & { sessionId: string | null }): Promise<ActionResult<{ id: string }>>`, `updateAnnouncement(id: string, input: AnnouncementInput): Promise<ActionResult<null>>`.

No unit test for this task — it's a thin wrapper whose only real logic (who's allowed to write what) is enforced by RLS, already covered by the existing invariant test suite. Verified by `tsc` here and exercised end to end in Task 11.

- [ ] **Step 1: Write the module**

Create `lib/actions/announcements.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import {
  announcementSchema,
  createAnnouncementSchema,
  announcementIdSchema,
  type AnnouncementInput,
} from "@/lib/validation/announcement";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

// Mirrors updateSession's existing revalidatePath strings
// (lib/actions/sessions.ts) rather than inventing a new convention.
function revalidateForSession(sessionId: string | null) {
  if (sessionId === null) {
    revalidatePath("/");
    revalidatePath("/dashboard");
    return;
  }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/manage`);
  revalidatePath("/dashboard");
}

export async function createAnnouncement(
  input: AnnouncementInput & { sessionId: string | null },
): Promise<ActionResult<{ id: string }>> {
  const parsed = createAnnouncementSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      session_id: parsed.data.sessionId,
      title: parsed.data.title,
      body: parsed.data.body,
      created_by: user.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // 42501 is an RLS refusal -- announcements_write requires is_admin() for
    // a community-wide row (sessionId null) or is_session_host(sessionId)
    // otherwise. The UI never offers this form to a caller who fails that
    // check, so this is defense-in-depth, not a reachable UI state.
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not post the announcement.");
  }

  revalidateForSession(parsed.data.sessionId);
  return ok({ id: data.id });
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementInput,
): Promise<ActionResult<null>> {
  const idParsed = announcementIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid announcement id.");

  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .update({ title: parsed.data.title, body: parsed.data.body })
    .eq("id", idParsed.data.id)
    .select("session_id")
    .single();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the announcement.");
  }

  revalidateForSession(data.session_id);
  return ok(null);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/announcements.ts
git commit -m "feat: add createAnnouncement and updateAnnouncement actions"
```

---

### Task 4: Textarea UI primitive

**Files:**
- Create: `components/ui/textarea.tsx`

**Interfaces:**
- Produces: `Textarea` component, `React.ComponentProps<"textarea">` props, same shape as `components/ui/input.tsx`'s `Input`.

The codebase has no `Textarea` primitive yet (`components/ui/` has no `textarea.tsx`). This is shadcn/ui's standard "new-york" style `Textarea` (matching `components.json`'s configured style and `input.tsx`'s existing formatting conventions), written directly rather than fetched via the `shadcn` CLI so this step doesn't depend on network access during execution.

- [ ] **Step 1: Write the component**

Create `components/ui/textarea.tsx`:

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/textarea.tsx
git commit -m "feat: add Textarea UI primitive"
```

---

### Task 5: AnnouncementForm dialog component

**Files:**
- Create: `components/sessions/announcement-form.tsx`

**Interfaces:**
- Consumes: `createAnnouncement`, `updateAnnouncement` (Task 3, `@/lib/actions/announcements`); `type AnnouncementRow` (Task 2, `@/lib/dal/announcements`); `Textarea` (Task 4); existing `Button`, `Dialog`/`DialogContent`/`DialogDescription`/`DialogFooter`/`DialogHeader`/`DialogTitle`/`DialogTrigger`, `Input`.
- Produces: `AnnouncementForm({ sessionId: string | null; announcement?: AnnouncementRow }): JSX.Element` — a "use client" component. No `announcement` prop = create mode (trigger reads "Post announcement"); `announcement` present = edit mode (trigger reads "Edit", fields pre-filled).

- [ ] **Step 1: Write the component**

Create `components/sessions/announcement-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createAnnouncement, updateAnnouncement } from "@/lib/actions/announcements";
import type { AnnouncementRow } from "@/lib/dal/announcements";

export function AnnouncementForm({
  sessionId,
  announcement,
}: {
  sessionId: string | null;
  announcement?: AnnouncementRow;
}) {
  const editing = announcement !== undefined;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = () => {
    startTransition(async () => {
      const result = editing
        ? await updateAnnouncement(announcement.id, { title, body })
        : await createAnnouncement({ sessionId, title, body });

      if (result.ok) {
        toast.success(editing ? "Announcement updated." : "Announcement posted.");
        setOpen(false);
        if (!editing) {
          setTitle("");
          setBody("");
        }
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={editing ? "outline" : "default"}>
          {editing ? "Edit" : "Post announcement"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit announcement" : "Post announcement"}</DialogTitle>
          <DialogDescription>
            {sessionId === null
              ? "Visible to everyone on the landing page and members' dashboards."
              : "Visible on this session's public page and to registered members."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            autoFocus
          />
          <Textarea
            placeholder="What do people need to know?"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={title.trim().length < 1 || body.trim().length < 1 || pending}
            onClick={onSubmit}
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/sessions/announcement-form.tsx
git commit -m "feat: add AnnouncementForm dialog component"
```

---

### Task 6: AnnouncementList component

**Files:**
- Create: `components/sessions/announcement-list.tsx`

**Interfaces:**
- Consumes: `AnnouncementForm` (Task 5); `type AnnouncementRow` (Task 2); existing `Card`/`CardContent`/`CardDescription`/`CardHeader`/`CardTitle`.
- Produces: `AnnouncementList({ sessionId: string | null; announcements: AnnouncementRow[] }): JSX.Element` — a server-renderable component (no hooks of its own; the interactive pieces are the `AnnouncementForm` children it renders). Used by the manage page and the admin page.

- [ ] **Step 1: Write the component**

Create `components/sessions/announcement-list.tsx`:

```tsx
import { AnnouncementForm } from "@/components/sessions/announcement-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnnouncementRow } from "@/lib/dal/announcements";

export function AnnouncementList({
  sessionId,
  announcements,
}: {
  sessionId: string | null;
  announcements: AnnouncementRow[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Announcements</h2>
        <AnnouncementForm sessionId={sessionId} />
      </div>

      {announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((announcement) => (
            <Card key={announcement.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{announcement.title}</CardTitle>
                  <AnnouncementForm sessionId={sessionId} announcement={announcement} />
                </div>
                <CardDescription>{new Date(announcement.publishedAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{announcement.body}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/sessions/announcement-list.tsx
git commit -m "feat: add AnnouncementList component"
```

---

### Task 7: Wire into the manage page (host write surface)

**Files:**
- Modify: `app/(app)/sessions/[id]/manage/page.tsx`

**Interfaces:**
- Consumes: `listHostAnnouncements` (Task 2), `AnnouncementList` (Task 6).

- [ ] **Step 1: Add the import**

In `app/(app)/sessions/[id]/manage/page.tsx`, add alongside the existing imports (after the `listRoster`/etc. imports):

```ts
import { listHostAnnouncements } from "@/lib/dal/announcements";
import { AnnouncementList } from "@/components/sessions/announcement-list";
```

- [ ] **Step 2: Fetch the data**

After the existing `const rotationQueue = await getRotationQueue(id);` line, add:

```ts
  const announcements = await listHostAnnouncements(id);
```

- [ ] **Step 3: Render the section**

Insert `<AnnouncementList sessionId={id} announcements={announcements} />` immediately after the closing `</div>` of the sticky confirmed/waiting/checked-in badge bar, and immediately before `<ManageTabs`. The surrounding JSX should read:

```tsx
      </div>

      <AnnouncementList sessionId={id} announcements={announcements} />

      <ManageTabs
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/sessions/[id]/manage/page.tsx"
git commit -m "feat: add announcements section to the manage page"
```

---

### Task 8: Wire into the admin page (community write surface)

**Files:**
- Modify: `app/(app)/admin/page.tsx`

**Interfaces:**
- Consumes: `listCommunityAnnouncementsForAdmin` (Task 2), `AnnouncementList` (Task 6).

- [ ] **Step 1: Add the imports**

In `app/(app)/admin/page.tsx`, add:

```ts
import { listCommunityAnnouncementsForAdmin } from "@/lib/dal/announcements";
import { AnnouncementList } from "@/components/sessions/announcement-list";
```

- [ ] **Step 2: Fetch the data and render**

Change the component body from:

```tsx
export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  const members = await listAllMembers();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Change a member&apos;s role. Hosts can manage sessions; admins can do everything a host
          can, plus this page.
        </p>
      </header>
      <MemberRoleTable members={members} currentUserId={user.id} />
    </div>
  );
}
```

to:

```tsx
export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  const [members, announcements] = await Promise.all([
    listAllMembers(),
    listCommunityAnnouncementsForAdmin(),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Change a member&apos;s role. Hosts can manage sessions; admins can do everything a host
            can, plus this page.
          </p>
        </header>
        <MemberRoleTable members={members} currentUserId={user.id} />
      </section>

      <section>
        <AnnouncementList sessionId={null} announcements={announcements} />
      </section>
    </div>
  );
}
```

(The outer wrapper's `gap-4` becomes `gap-8` since it now separates two distinct sections rather than a header and one table.)

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/page.tsx"
git commit -m "feat: add community announcements section to the admin page"
```

---

### Task 9: Translation keys for the marketing route group

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/id.json`

**Interfaces:**
- Produces: an `announcements` namespace with key `title`, consumed by Tasks 10 and 11 via `getTranslations("announcements")` / `useTranslations("announcements")`.

- [ ] **Step 1: Add the English key**

In `messages/en.json`, add a new top-level `"announcements"` key (alongside `"sessionDetail"`, `"register"`, etc.):

```json
  "announcements": {
    "title": "Announcements"
  },
```

- [ ] **Step 2: Add the Indonesian key**

In `messages/id.json`, add the same key in the same position:

```json
  "announcements": {
    "title": "Pengumuman"
  },
```

- [ ] **Step 3: Verify both files are still valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json')); JSON.parse(require('fs').readFileSync('messages/id.json')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/id.json
git commit -m "feat: add announcements translation keys"
```

---

### Task 10: Wire into the public session detail page

**Files:**
- Modify: `app/[locale]/(marketing)/sessions/[id]/page.tsx`

**Interfaces:**
- Consumes: `listPublicSessionAnnouncements` (Task 2), translation namespace `announcements` (Task 9).

- [ ] **Step 1: Add the import**

Add alongside the existing imports:

```ts
import { listPublicSessionAnnouncements } from "@/lib/dal/announcements";
```

- [ ] **Step 2: Fetch translations and data**

Change:

```tsx
export default async function SessionDetailPage({
  params,
}: PageProps<"/[locale]/sessions/[id]">) {
  const { id } = await params;
  const [session, t] = await Promise.all([getPublicSession(id), getTranslations("sessionDetail")]);
  if (!session) notFound();
```

to:

```tsx
export default async function SessionDetailPage({
  params,
}: PageProps<"/[locale]/sessions/[id]">) {
  const { id } = await params;
  const [session, t, tAnnouncements] = await Promise.all([
    getPublicSession(id),
    getTranslations("sessionDetail"),
    getTranslations("announcements"),
  ]);
  if (!session) notFound();

  const announcements = await listPublicSessionAnnouncements(id);
```

- [ ] **Step 3: Render the section**

Insert this block right after the `{session.description ? ... : null}` line and before the `<dl className="grid grid-cols-3 gap-4 rounded-xl border bg-card p-4 text-sm">` block:

```tsx
      {announcements.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{tAnnouncements("title")}</h2>
          <div className="flex flex-col gap-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
                <p className="text-sm font-medium">{announcement.title}</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{announcement.body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(marketing)/sessions/[id]/page.tsx"
git commit -m "feat: show session announcements on the public session page"
```

---

### Task 11: Wire into the marketing landing page

**Files:**
- Modify: `app/[locale]/(marketing)/page.tsx`

**Interfaces:**
- Consumes: `listPublicCommunityAnnouncements` (Task 2), translation namespace `announcements` (Task 9).

- [ ] **Step 1: Add the import and ISR export**

Change the top of `app/[locale]/(marketing)/page.tsx` from:

```tsx
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default function Home() {
  const t = useTranslations("home");
```

to:

```tsx
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { listPublicCommunityAnnouncements } from "@/lib/dal/announcements";

// This page previously did no data fetching at all. Matches
// (marketing)/sessions/page.tsx's existing revalidate value so this page
// keeps ISR caching instead of becoming fully dynamic now that it reads
// from the database.
export const revalidate = 60;

export default async function Home() {
  const t = useTranslations("home");
  const tAnnouncements = useTranslations("announcements");
  const announcements = await listPublicCommunityAnnouncements();
```

- [ ] **Step 2: Render the section**

After the existing closing `</section>` for the "running" section (the one with `{t("runningTitle")}`), and before the component's final `</>`, add:

```tsx
      {announcements.length > 0 ? (
        <>
          <hr className="border-t-2 border-border" />

          <section className="px-6 py-16">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{tAnnouncements("title")}</h2>
              <div className="flex flex-col gap-3">
                {announcements.map((announcement) => (
                  <div key={announcement.id} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
                    <p className="text-sm font-medium">{announcement.title}</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{announcement.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/(marketing)/page.tsx"
git commit -m "feat: show community announcements on the landing page"
```

---

### Task 12: Wire into the member dashboard

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `listMyAnnouncementsFeed` (Task 2). `Card`/`CardContent`/`CardDescription`/`CardHeader`/`CardTitle` are already imported in this file.

- [ ] **Step 1: Add the import**

Add alongside the existing imports:

```ts
import { listMyAnnouncementsFeed } from "@/lib/dal/announcements";
```

- [ ] **Step 2: Fetch the data**

Change:

```tsx
export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const registrations = await listMyUpcomingRegistrations();
  const hosted = user.role === "member" ? [] : await listMyHostedSessions();
```

to:

```tsx
export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const [registrations, announcements] = await Promise.all([
    listMyUpcomingRegistrations(),
    listMyAnnouncementsFeed(),
  ]);
  const hosted = user.role === "member" ? [] : await listMyHostedSessions();
```

- [ ] **Step 3: Render the section**

Insert this block as the first child inside the outer `<div className="mx-auto flex max-w-3xl flex-col gap-10">`, before the existing "Your upcoming sessions" `<section>`:

```tsx
      {announcements.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Announcements</h2>
          <div className="flex flex-col gap-3">
            {announcements.map((announcement) => (
              <Card key={announcement.id}>
                <CardHeader>
                  <CardTitle>{announcement.title}</CardTitle>
                  <CardDescription>{new Date(announcement.publishedAt).toLocaleString()}</CardDescription>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">{announcement.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat: show announcements feed on the member dashboard"
```

---

### Task 13: Full verification pass

**Files:** none (verification only; fix-forward commits only if this task finds a real bug).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `announcementSchema` cases from Task 1.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification — host write surface**

Start the dev server (`npm run dev`), sign in as `host@jakbar.local` / `password123` (local seed credentials, `supabase/seed.sql`), open `/sessions/<a session this host owns>/manage`, use "Post announcement" to create one, confirm it appears in the list immediately, edit it via "Edit", confirm the change persists after dialog close.

- [ ] **Step 4: Manual verification — admin write surface**

Sign in as `admin@jakbar.local` / `password123`, open `/admin`, confirm the announcements section renders below the members table, post a community-wide announcement, edit it, confirm both persist.

- [ ] **Step 5: Manual verification — public read surfaces**

While signed out (or in a private window), visit the public page for the session from Step 3 (`/sessions/<id>`, no `/manage`) and confirm the session-scoped announcement shows. Visit `/` (the landing page) and confirm the community-wide announcement from Step 4 shows.

- [ ] **Step 6: Manual verification — member dashboard feed**

Sign in as `member@jakbar.local` / `password123`, register for the session from Step 3 if not already registered, open `/dashboard`, confirm both the community-wide announcement and the session-scoped one appear in the new Announcements section.

- [ ] **Step 7: Manual verification — write UI is not reachable by a member**

While still signed in as `member@jakbar.local`, attempt to navigate directly to `/admin` and to `/sessions/<id>/manage` for a session this member does not host — confirm both redirect/404 via the existing `requireAdmin`/`requireHost`/`getHostSession` gating (this is confirming pre-existing gating still holds, not new checks introduced by this feature).

- [ ] **Step 8: Stop the dev server**

No commit for this task unless a step above surfaces a real defect, in which case: fix it, re-run the relevant verification step, then commit the fix with a message describing what was wrong.
