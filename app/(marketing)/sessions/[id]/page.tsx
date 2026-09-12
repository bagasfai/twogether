import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicSession } from "@/lib/dal/public-sessions";
import { RegisterPanel } from "@/components/sessions/register-panel";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/sessions/[id]">): Promise<Metadata> {
  const { id } = await params;
  const session = await getPublicSession(id);
  if (!session) return { title: "Session not found" };

  const description = `${new Date(session.startsAt).toLocaleString()} · ${session.location}`;

  return {
    title: `${session.title} — Jakbar Twogether`,
    description,
    // this link gets pasted into WhatsApp, so the preview matters
    openGraph: { title: session.title, description, type: "website" },
  };
}

export default async function SessionDetailPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  const session = await getPublicSession(id);
  if (!session) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{session.title}</h1>
        <p className="text-muted-foreground">
          {new Date(session.startsAt).toLocaleString()} – {new Date(session.endsAt).toLocaleTimeString()}
        </p>
        <p className="text-muted-foreground">
          {session.locationUrl ? (
            <a href={session.locationUrl} className="underline" rel="noreferrer noopener" target="_blank">
              {session.location}
            </a>
          ) : (
            session.location
          )}
        </p>
      </header>

      {session.description ? <p>{session.description}</p> : null}

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Courts</dt>
        <dd>{session.courtCount}</dd>
        <dt className="text-muted-foreground">Capacity</dt>
        <dd>{session.maxParticipants}</dd>
        <dt className="text-muted-foreground">Waitlist</dt>
        <dd>{session.waitlistCapacity}</dd>
      </dl>

      {/* Spots remaining is deliberately absent: a live count here would force a
          revalidatePath on every registration and defeat the ISR cache. */}
      <RegisterPanel sessionId={session.id} registrationOpen={session.registrationState === "open"} />
    </div>
  );
}
