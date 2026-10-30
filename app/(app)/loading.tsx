import { CardListSkeleton, SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";

// Fallback for (app) routes without their own loading.tsx.
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-3xl gap-3">
      <TitleSkeleton />
      <CardListSkeleton count={3} />
    </SkeletonPage>
  );
}
