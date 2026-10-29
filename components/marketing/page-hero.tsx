import type { ReactNode } from "react";
import { CourtLines } from "@/components/marketing/court-lines";

// Sky-blue court banner shared by every inner marketing page. The h1 lives
// here so each page keeps exactly one heading level 1.
export function PageHero({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="court-field relative isolate overflow-hidden text-white">
      <CourtLines className="absolute inset-0 -z-10 size-full text-white/20" />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 pb-10 pt-10 sm:pb-14 sm:pt-14">
        <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-extrabold uppercase italic leading-[0.95] tracking-tight text-balance [overflow-wrap:anywhere]">
          {title}
        </h1>
        {subtitle ? <p className="max-w-[52ch] text-base text-white sm:text-lg">{subtitle}</p> : null}
        {children}
      </div>
    </section>
  );
}
