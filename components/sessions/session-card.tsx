import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { PublicSession } from "@/lib/dal/public-sessions";
import { formatTime } from "@/lib/format/datetime";

const TIME_ZONE = "Asia/Jakarta";

function dateParts(iso: string, locale: string) {
  const d = new Date(iso);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...opts, timeZone: TIME_ZONE }).format(d);
  return {
    day: part({ day: "numeric" }),
    month: part({ month: "short" }),
    weekday: part({ weekday: "short" }),
  };
}

// A court ticket: the date stub on the left, the session on the right. The
// whole ticket is one link (stretched ::after). Open sessions are drawn solid
// (navy stub, cork chip); closed ones are dashed and muted.
export function SessionCard({ session }: { session: PublicSession }) {
  const t = useTranslations();
  const locale = useLocale();
  const open = session.registrationState === "open";
  const { day, month, weekday } = dateParts(session.startsAt, locale);

  return (
    <article
      className={cn(
        "group relative flex overflow-hidden rounded-2xl bg-card shadow-[0_8px_24px_-12px_oklch(28%_0.13_264/0.35)] transition-[transform,box-shadow] duration-[var(--dur-short)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-12px_oklch(28%_0.13_264/0.45)] focus-within:ring-[3px] focus-within:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        open ? "border-2 border-navy" : "border-2 border-dashed border-input",
      )}
    >
      <div
        className={cn(
          "flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-4 text-center sm:w-28",
          open ? "bg-navy text-white" : "bg-muted text-muted-foreground",
        )}
      >
        <span className="text-xs font-semibold uppercase tracking-wide">{weekday}</span>
        <span className="font-display text-5xl font-extrabold italic leading-none tabular-nums sm:text-6xl">{day}</span>
        <span className="text-xs font-semibold uppercase tracking-wide">{month}</span>
      </div>
      {/* ticket perforation */}
      <div aria-hidden="true" className="relative w-0 border-l-2 border-dashed border-input">
        <span className="absolute -left-2.5 -top-2.5 size-5 rounded-full bg-background" />
        <span className="absolute -bottom-2.5 -left-2.5 size-5 rounded-full bg-background" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
        <span
          className={cn(
            "w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold",
            open ? "bg-cork text-navy" : "border border-input text-muted-foreground",
          )}
        >
          {open ? t("badge.open") : t("badge.closed")}
        </span>
        <h3 className="font-display text-2xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">
          <Link
            href={`/sessions/${session.id}`}
            className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-accent-text"
          >
            {session.title}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {formatTime(session.startsAt, locale)} – {formatTime(session.endsAt, locale)} · {session.location}
        </p>
        {/* capacity, not spots remaining -- see the comment on the detail page */}
        <p className="font-display text-base font-semibold tabular-nums text-foreground">
          {t("sessionCard.meta", {
            spots: session.maxParticipants,
            waitlist: session.waitlistCapacity,
            courts: session.courtCount,
          })}
        </p>
      </div>
    </article>
  );
}
