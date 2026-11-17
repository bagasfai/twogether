import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase";
import { assertLocalStack, env } from "./env";
import { E2E_SESSION_PREFIX, sweepE2eData as sweepWith, type SweepClient } from "./sweep";

export type Role = "member" | "host" | "admin";
export type Gender = Database["public"]["Enums"]["gender"];
export type TestUser = { id: string; email: string; password: string; fullName: string; role: Role };
export type TestSession = { id: string; title: string };

export const TEST_PASSWORD = "E2e-pass-123";

const runId = randomBytes(3).toString("hex");
let sessionCounter = 0;
let cached: SupabaseClient<Database> | null = null;

const NO_PERSIST = { auth: { persistSession: false, autoRefreshToken: false } };

export function admin(): SupabaseClient<Database> {
  if (!cached) {
    assertLocalStack();
    cached = createClient<Database>(env.supabaseUrl, env.serviceRoleKey, NO_PERSIST);
  }
  return cached;
}

export function testEmail(label: string): string {
  return `delivered+e2e-${runId}-${label}@resend.dev`;
}

export function randomPhone(): string {
  return `+62812${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

export async function createUser(o: { label: string; role?: Role; gender?: Gender }): Promise<TestUser> {
  const role = o.role ?? "member";
  const email = testEmail(o.label);
  const fullName = `E2E ${o.label} ${runId}`;

  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: randomPhone() },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message ?? "no user returned"}`);
  const id = data.user.id;

  if (role !== "member") {
    const { error: roleError } = await admin().from("profiles").update({ role }).eq("id", id);
    if (roleError) throw new Error(`set role ${role} for ${email}: ${roleError.message}`);
  }
  if (o.gender) {
    const { error: genderError } = await admin()
      .from("profiles_private")
      .upsert({ user_id: id, gender: o.gender }, { onConflict: "user_id" });
    if (genderError) throw new Error(`set gender for ${email}: ${genderError.message}`);
  }

  return { id, email, password: TEST_PASSWORD, fullName, role };
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw new Error(`deleteUser ${id}: ${error.message}`);
}

const USERS_PER_PAGE = 200;

async function listUsers(page: number, perPage: number) {
  const { data, error } = await admin().auth.admin.listUsers({ page, perPage });
  if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
  return data.users;
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const wanted = email.toLowerCase();
  for (let page = 1; ; page += 1) {
    const users = await listUsers(page, USERS_PER_PAGE);
    const match = users.find((user) => user.email?.toLowerCase() === wanted);
    if (match) return match.id;
    if (users.length < USERS_PER_PAGE) return null;
  }
}

export async function createSession(
  owner: TestUser,
  o: {
    maxParticipants?: number;
    waitlistCapacity?: number;
    courtCount?: number;
    status?: "draft" | "scheduled";
    registrationState?: "open" | "closed";
  } = {},
): Promise<TestSession> {
  sessionCounter += 1;
  const title = `${E2E_SESSION_PREFIX}${runId} ${sessionCounter}`;
  const courtCount = o.courtCount ?? 2;
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

  const { data, error } = await admin()
    .from("sessions")
    .insert({
      title,
      location: "E2E Hall",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      kind: "open_play",
      court_count: courtCount,
      max_participants: o.maxParticipants ?? 8,
      waitlist_capacity: o.waitlistCapacity ?? 4,
      registration_state: o.registrationState ?? "open",
      status: o.status ?? "scheduled",
      created_by: owner.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createSession ${title}: ${error?.message ?? "no row returned"}`);

  const { error: courtsError } = await admin()
    .from("courts")
    .insert(Array.from({ length: courtCount }, (_, i) => ({ session_id: data.id, court_number: i + 1 })));
  if (courtsError) throw new Error(`create courts for ${title}: ${courtsError.message}`);

  return { id: data.id, title };
}

// guard_court_delete refuses to drop a court with a scheduled or in-progress
// match, and galleries.session_id is ON DELETE SET NULL, so both go first.
async function purgeSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const matches = await admin().from("matches").delete().in("session_id", ids);
  if (matches.error) throw new Error(`delete matches: ${matches.error.message}`);
  const galleries = await admin().from("galleries").delete().in("session_id", ids);
  if (galleries.error) throw new Error(`delete galleries: ${galleries.error.message}`);
  const sessions = await admin().from("sessions").delete().in("id", ids);
  if (sessions.error) throw new Error(`delete sessions: ${sessions.error.message}`);
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await purgeSessions([id]);
  } catch (error) {
    throw new Error(`deleteSession ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function addCheckedInParticipant(sessionId: string, user: TestUser): Promise<void> {
  const asUser = createClient<Database>(env.supabaseUrl, env.anonKey, NO_PERSIST);
  const { error: signInError } = await asUser.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signInError) throw new Error(`sign in ${user.email}: ${signInError.message}`);

  const { error: rpcError } = await asUser.rpc("register_for_session", { p_session_id: sessionId });
  await asUser.auth.signOut({ scope: "local" });
  if (rpcError) throw new Error(`register ${user.email}: ${rpcError.message}`);

  const { data, error } = await admin()
    .from("participants")
    .update({ checked_in_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .select("id");
  if (error || !data?.length) throw new Error(`check in ${user.email}: ${error?.message ?? "no participant row"}`);
}

async function hashedToken(params: Parameters<SupabaseClient["auth"]["admin"]["generateLink"]>[0]): Promise<string> {
  const { data, error } = await admin().auth.admin.generateLink(params);
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new Error(`generateLink ${params.type}: ${error?.message ?? "no token returned"}`);
  return token;
}

export async function confirmationLink(email: string, password: string): Promise<string> {
  const token = await hashedToken({ type: "signup", email, password });
  return `/auth/confirm?token_hash=${token}&type=email&next=/dashboard`;
}

export async function recoveryLink(email: string): Promise<string> {
  const token = await hashedToken({ type: "recovery", email });
  return `/auth/confirm?token_hash=${token}&type=recovery`;
}

function sweepClient(): SweepClient {
  return {
    async deleteGalleriesByTitlePrefix(prefix) {
      const { error } = await admin().from("galleries").delete().like("title", `${prefix}%`);
      if (error) throw new Error(error.message);
    },
    async deleteSessionsByTitlePrefix(prefix) {
      const { data, error } = await admin().from("sessions").select("id").like("title", `${prefix}%`);
      if (error) throw new Error(error.message);
      await purgeSessions((data ?? []).map((row) => row.id));
    },
    listUsers,
    deleteUser,
  };
}

export async function sweepE2eData(client: SweepClient = sweepClient()): Promise<void> {
  await sweepWith(client);
}
