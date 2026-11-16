import { CardListSkeleton, SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-3xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TitleSkeleton className="w-64" description />
        <Skeleton className="h-11 w-32 md:h-9" />
      </div>
      <CardListSkeleton count={3} badge />
    </SkeletonPage>
  );
}
