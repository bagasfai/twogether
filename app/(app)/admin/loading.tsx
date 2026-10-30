import { SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the collapsed accordion: the first section (Members) open, the rest closed.
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-3xl gap-4">
      <TitleSkeleton className="mb-2 w-40" />
      <div className="flex flex-col gap-4 rounded-2xl border-2 bg-card px-5 py-4">
        <SectionBar />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="rounded-2xl border-2 bg-card px-5 py-4">
          <SectionBar />
        </div>
      ))}
    </SkeletonPage>
  );
}

function SectionBar() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="size-8 shrink-0 rounded-full" />
    </div>
  );
}
