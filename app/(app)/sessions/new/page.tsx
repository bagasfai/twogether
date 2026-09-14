import { requireHost } from "@/lib/dal/user";
import { SessionForm } from "@/components/sessions/session-form";

export default async function NewSessionPage() {
  // UX gate only: a member who reaches this URL is bounced to /dashboard, and
  // even if they were not, sessions_insert_host would refuse the insert.
  await requireHost("/sessions/new");

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">New session</h1>
      <SessionForm />
    </div>
  );
}
