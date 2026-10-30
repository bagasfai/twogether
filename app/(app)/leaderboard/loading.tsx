import { SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-3xl gap-4">
      <TitleSkeleton className="w-72" />
      <div className="flex flex-col rounded-2xl border bg-card p-2">
        <div className="flex items-center gap-4 border-b px-2 py-3">
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto h-4 w-12" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-2 py-3 last:border-b-0">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-8" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
