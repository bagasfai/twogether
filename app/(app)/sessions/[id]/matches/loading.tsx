import { SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-3xl gap-4">
      <TitleSkeleton className="w-80" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
            <Skeleton className="h-4 w-32" />
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
