import { FieldSkeleton, SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto w-full max-w-xl gap-6">
      <TitleSkeleton className="w-56" />
      <div className="flex flex-col gap-6">
        <FieldSkeleton />
        <FieldSkeleton />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
        <FieldSkeleton />
        <div className="grid grid-cols-3 gap-4">
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
        <FieldSkeleton />
        <Skeleton className="h-9 w-36" />
      </div>
    </SkeletonPage>
  );
}
