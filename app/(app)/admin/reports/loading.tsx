import { SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-6xl gap-6">
      <TitleSkeleton className="w-40" description />
      <Skeleton className="h-9 w-80 max-w-full" />
      <Skeleton className="h-16 w-full" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </SkeletonPage>
  );
}
