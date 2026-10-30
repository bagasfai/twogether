import { CardListSkeleton, SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-3xl gap-3">
      <TitleSkeleton className="w-80" />
      <CardListSkeleton count={4} badge />
    </SkeletonPage>
  );
}
