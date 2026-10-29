import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPublicSession } from "@/lib/dal/public-sessions";
import { listPublicSessionAnnouncements } from "@/lib/dal/announcements";
import { PageHero } from "@/components/marketing/page-hero";
import { RegisterPanel } from "@/components/sessions/register-panel";
import { RegisteredParticipants } from "@/components/sessions/registered-participants";
import { UploadPanel } from "@/components/gallery/upload-panel";
import { getAlbumForSession } from "@/lib/dal/galleries";
import { formatDateTime, formatTime } from "@/lib/format/datetime";

export const revalidate = 60;

// Required for ISR on a dynamic segment: without this, `revalidate` above is
// inert and the route renders dynamically on every request. An empty array
// means no ids are known at build time -- the first request to each id
// builds and caches it, and subsequent requests are served from that cache
// until the next revalidation window.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sessions/[id]">): Promise<Metadata> {
  const { id, locale } = await params;
  const [session, t] = await Promise.all([getPublicSession(id), getTranslations({ locale, namespace: "sessionDetail" })]);
  if (!session) return { title: t("notFound") };

  const description = `${formatDateTime(session.startsAt, locale)} · ${session.location}`;

  return {
    title: `${session.title} — Jakbar Twogether`,
    description,
    // this link gets pasted into WhatsApp, so the preview matters
    openGraph: {
      title: session.title,
      description,
      type: "website",
      images: [{ url: "/brand/jakbar-twogether.jpeg", width: 640, height: 640, alt: "Jakbar Twogether" }],
    },
  };
}

export default async function SessionDetailPage({
  params,
}: PageProps<"/[locale]/sessions/[id]">) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const [session, t, tAnnouncements] = await Promise.all([
    getPublicSession(id),
    getTranslations({ locale, namespace: "sessionDetail" }),
    getTranslations({ locale, namespace: "announcements" }),
  ]);
  if (!session) notFound();

  // Both read through the cookieless anon client, so the page stays ISR.
  const [announcements, album] = await Promise.all([listPublicSessionAnnouncements(id), getAlbumForSession(id)]);

  return (
    <>
      <PageHero
        title={session.title}
        subtitle={
          <span className="flex flex-col gap-1">
            <span className="font-display text-2xl font-semibold tabular-nums">
              {formatDateTime(session.startsAt, locale)} – {formatTime(session.endsAt, locale)}
            </span>
            <span>
              {session.locationUrl ? (
                <a
                  href={session.locationUrl}
                  className="underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-[3px] focus-visible:ring-white"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {session.location}
                </a>
              ) : (
                session.location
              )}
            </span>
          </span>
        }
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
        {/* Spots remaining is deliberately absent: a live count here would force a
            revalidatePath on every registration and defeat the ISR cache. */}
        <div className="rounded-3xl border-2 border-navy bg-sky-pale p-5 sm:p-6">
          <RegisterPanel
            sessionId={session.id}
            sessionKind={session.kind}
            startsAt={session.startsAt}
            registrationOpen={session.registrationState === "open"}
          />
        </div>

        {session.description ? (
          <p className="max-w-[65ch] whitespace-pre-wrap text-lg leading-relaxed">{session.description}</p>
        ) : null}

        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-navy/20 text-sm">
          {(
            [
              [t("courts"), session.courtCount],
              [t("capacity"), session.maxParticipants],
              [t("waitlist"), session.waitlistCapacity],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse justify-end gap-1 bg-navy p-4 text-white">
              <dt className="text-white/85">{label}</dt>
              <dd className="font-display text-4xl font-extrabold italic leading-none tabular-nums text-cork">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {announcements.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-3xl font-extrabold uppercase italic leading-none tracking-tight">
              {tAnnouncements("title")}
            </h2>
            <div className="flex flex-col gap-3">
              {announcements.map((announcement) => (
                <div key={announcement.id} className="flex flex-col gap-1 rounded-2xl bg-sky-pale p-4">
                  <p className="font-display text-xl font-bold leading-tight">{announcement.title}</p>
                  <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <RegisteredParticipants sessionId={session.id} />

        {/* The panel decides on the client whether this viewer may upload and
            renders nothing otherwise, so visitors get the same static page. */}
        {album ? <UploadPanel galleryId={album.id} /> : null}
      </div>
    </>
  );
}
