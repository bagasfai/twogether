import { FieldSkeleton, SkeletonPage } from "@/components/app/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto w-full max-w-md">
      <div className="flex flex-col gap-6 rounded-2xl border bg-card px-6 py-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="flex flex-col gap-4">
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
    </SkeletonPage>
  );
}
