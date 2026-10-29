"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { SocialIcon } from "@/components/marketing/social-icon";
import type { FeaturedPost } from "@/lib/dal/socials";

export function FeaturedPostsCarousel({
  posts,
  locale,
}: {
  posts: FeaturedPost[];
  locale: string;
}) {
  const t = useTranslations("home");
  const tKinds = useTranslations("socials.kinds");

  if (posts.length === 0) return null;
  const multiple = posts.length > 1;

  return (
    <section className="py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
            {t("featuredTitle")}
          </h2>
          <p className="max-w-[52ch] text-base text-muted-foreground">{t("featuredBody")}</p>
        </div>
        <Carousel opts={{ align: "start", dragFree: false }} aria-label={t("featuredTitle")}>
          <CarouselContent>
            {posts.map((post) => {
              const caption = locale === "id" ? post.captionId : post.captionEn;
              return (
                <CarouselItem key={post.id} className="basis-[85%] sm:basis-1/2 lg:basis-1/3">
                  <a
                    href={post.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col gap-3 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-sky-pale">
                      <Image
                        src={post.imageUrl}
                        alt={caption}
                        fill
                        sizes="(min-width:1024px) 33vw, 85vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                      <Badge className="absolute left-3 top-3 bg-white text-navy">
                        {tKinds(post.kind)}
                      </Badge>
                      <span className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-navy text-white">
                        <SocialIcon platform={post.platform} className="size-5" />
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium">{caption}</p>
                  </a>
                </CarouselItem>
              );
            })}
          </CarouselContent>
          {multiple ? (
            <div className="mt-4 flex gap-2 max-sm:hidden">
              <CarouselPrevious className="static translate-y-0" />
              <CarouselNext className="static translate-y-0" />
            </div>
          ) : null}
        </Carousel>
      </div>
    </section>
  );
}
