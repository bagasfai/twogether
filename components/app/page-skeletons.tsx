import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Building blocks for the per-route loading.tsx files under (app). Each page's
// skeleton mirrors its real layout (width, title, cards) so the swap to real
// content does not jump.

export function SkeletonPage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col", className)} role="status" aria-label="Loading">
      {children}
    </div>
  );
}

export function TitleSkeleton({ className, description = false }: { className?: string; description?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className={cn("h-9 w-64 max-w-full sm:h-10", className)} />
      {description ? <Skeleton className="h-4 w-80 max-w-full" /> : null}
    </div>
  );
}

export function SectionTitleSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-7 w-48 max-w-full", className)} />;
}

// Same shell as <Card>: rounded-2xl border, title row + description line.
export function CardSkeleton({ badge = false, lines = 0 }: { badge?: boolean; lines?: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card px-6 py-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-48 max-w-[60%]" />
        {badge ? <Skeleton className="h-5 w-20 rounded-full" /> : null}
      </div>
      <Skeleton className="h-4 w-64 max-w-[80%]" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 3, badge = false }: { count?: number; badge?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} badge={badge} />
      ))}
    </div>
  );
}

// Label + input, as rendered by FormItem.
export function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
