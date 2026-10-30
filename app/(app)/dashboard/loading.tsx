import { CardListSkeleton, CardSkeleton, SectionTitleSkeleton, SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-3xl gap-10">
      <CardSkeleton badge lines={1} />
      <section className="flex flex-col gap-3">
        <TitleSkeleton className="w-80" />
        <CardListSkeleton count={2} badge />
      </section>
      <section className="flex flex-col gap-3">
        <SectionTitleSkeleton />
        <CardListSkeleton count={2} />
      </section>
    </SkeletonPage>
  );
}
