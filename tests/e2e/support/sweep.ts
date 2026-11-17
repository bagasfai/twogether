export const E2E_SESSION_PREFIX = "E2E ";

const E2E_EMAIL = /^delivered\+e2e-[^@]+@resend\.dev$/;

export function isE2eEmail(email: string | null | undefined): boolean {
  return E2E_EMAIL.test(email ?? "");
}

export type SweepClient = {
  deleteGalleriesByTitlePrefix(prefix: string): Promise<void>;
  deleteSessionsByTitlePrefix(prefix: string): Promise<void>;
  listUsers(page: number, perPage: number): Promise<{ id: string; email?: string | null }[]>;
  deleteUser(id: string): Promise<void>;
};

const PER_PAGE = 200;

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function sweepE2eData(client: SweepClient): Promise<void> {
  const failures: string[] = [];

  // Starting a session creates a gallery with the session's title; deleting
  // the session only nulls galleries.session_id.
  try {
    await client.deleteGalleriesByTitlePrefix(E2E_SESSION_PREFIX);
  } catch (error) {
    failures.push(`galleries titled "${E2E_SESSION_PREFIX}%": ${reason(error)}`);
  }

  try {
    await client.deleteSessionsByTitlePrefix(E2E_SESSION_PREFIX);
  } catch (error) {
    failures.push(`sessions titled "${E2E_SESSION_PREFIX}%": ${reason(error)}`);
  }

  const targets: { id: string; email: string }[] = [];
  for (let page = 1; ; page += 1) {
    const users = await client.listUsers(page, PER_PAGE);
    for (const user of users) {
      if (isE2eEmail(user.email)) targets.push({ id: user.id, email: user.email as string });
    }
    if (users.length < PER_PAGE) break;
  }

  for (const target of targets) {
    try {
      await client.deleteUser(target.id);
    } catch (error) {
      failures.push(`user ${target.id} (${target.email}): ${reason(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`E2E sweep could not delete:\n- ${failures.join("\n- ")}`);
  }
}
