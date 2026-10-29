import type { Metadata } from "next";
import { requireHost } from "@/lib/dal/user";
import { PageTitle, SectionTitle } from "@/components/app/page-title";
import { SessionForm } from "@/components/sessions/session-form";

export const metadata: Metadata = { title: "New session" };

export default async function NewSessionPage() {
  // UX gate only: a member who reaches this URL is bounced to /dashboard, and
  // even if they were not, sessions_insert_host would refuse the insert.
  await requireHost("/sessions/new");

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle className="mb-6">New session</PageTitle>
      <SessionForm />
    </div>
  );
}
