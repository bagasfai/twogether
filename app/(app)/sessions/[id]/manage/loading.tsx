import { SectionTitleSkeleton, SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage className="gap-4 sm:gap-6 lg:mx-auto lg:w-full lg:max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TitleSkeleton className="w-72" description />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="size-9" />
        </div>
      </div>

      {/* Navy stat bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-navy px-4 py-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 bg-white/20" />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <SectionTitleSkeleton />
        <Skeleton className="h-9 w-24" />
      </div>

      {/* Phone tab bar; panels sit side by side on lg */}
      <Skeleton className="h-14 w-full rounded-2xl lg:hidden" />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-3">
          <SectionTitleSkeleton className="w-32" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        </div>
        <div className="hidden flex-col gap-3 lg:flex">
          <SectionTitleSkeleton className="w-32" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
