import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Heading for signed-in pages: display voice, one h1 per page. Operate surfaces
// keep it modest in size so the working content leads.
export function PageTitle({
  children,
  description,
  className,
}: {
  children: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-1", className)}>
      <h1 className="font-display text-3xl font-extrabold uppercase italic leading-none tracking-tight text-balance [overflow-wrap:anywhere] sm:text-4xl">
        {children}
      </h1>
      {description ? <p className="max-w-[65ch] text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}

// Section heading (h2) in the same voice, one step down.
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("font-display text-2xl font-bold uppercase italic leading-none tracking-tight", className)}>
      {children}
    </h2>
  );
}
