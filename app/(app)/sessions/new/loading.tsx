import { FieldSkeleton, SkeletonPage, TitleSkeleton } from "@/components/app/page-skeletons";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors SessionForm, which renders inside a Card.
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto w-full max-w-xl gap-6">
      <TitleSkeleton className="w-56" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <div className="flex flex-col gap-6">
          <CardContent className="space-y-4">
            <FieldSkeleton />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-20 w-full" />
            </div>
            <FieldSkeleton />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-full" />
          </CardFooter>
        </div>
      </Card>
    </SkeletonPage>
  );
}
