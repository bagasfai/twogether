import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicSession } from "@/lib/dal/public-sessions";
import { RegisterPanel } from "@/components/sessions/register-panel";

export const revalidate = 60;

// Required for ISR on a dynamic segment: without this, `revalidate` above is
// inert and the route renders dynamically on every request. An empty array
// means no ids are known at build time -- the first request to each id
// builds and caches it, and subsequent requests are served from that cache
// until the next revalidation window.
export async function generateStaticParams() {
  return [];
}

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{session.title}</h1>
        <p className="text-muted-foreground">
          {new Date(session.startsAt).toLocaleString()} – {new Date(session.endsAt).toLocaleTimeString()}
        </p>
        <p className="text-muted-foreground">
          {session.locationUrl ? (
            <a
              href={session.locationUrl}
              className="text-accent underline-offset-4 hover:underline"
              rel="noreferrer noopener"
              target="_blank"
            >
              {session.location}
            </a>
          ) : (
            session.location
          )}
        </p>
      </header>

      {session.description ? <p className="max-w-[65ch] text-base">{session.description}</p> : null}

      <dl className="grid grid-cols-3 gap-4 rounded-xl border bg-card p-4 text-sm">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Courts</dt>
          <dd className="font-mono text-lg tabular-nums">{session.courtCount}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Capacity</dt>
          <dd className="font-mono text-lg tabular-nums">{session.maxParticipants}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Waitlist</dt>
          <dd className="font-mono text-lg tabular-nums">{session.waitlistCapacity}</dd>
        </div>
      </dl>

      {/* Spots remaining is deliberately absent: a live count here would force a
          revalidatePath on every registration and defeat the ISR cache. */}
      <RegisterPanel sessionId={session.id} registrationOpen={session.registrationState === "open"} />
    </div>
  );
}
