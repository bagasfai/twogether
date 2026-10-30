import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Collapsible admin panel. Native <details> so it needs no client JS; the
// open/close animation comes from the shared .disclosure rule in globals.css.
export function AdminSection({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="disclosure group rounded-2xl border-2 border-border bg-card transition-colors duration-[var(--dur-short)] open:border-navy"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-bold uppercase italic leading-none tracking-tight">
              {title}
            </h2>
            {badge}
          </span>
          {description ? <span className="text-sm text-muted-foreground">{description}</span> : null}
        </span>
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-pale text-navy transition-transform duration-[var(--dur-short)] ease-[var(--ease-out)] group-open:rotate-180 motion-reduce:transition-none"
        >
          <ChevronDown className="size-4" />
        </span>
      </summary>
      <div className="flex min-w-0 flex-col gap-4 px-5 pb-5">{children}</div>
    </details>
  );
}
