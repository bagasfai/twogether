import { getTranslations } from "next-intl/server";
import { SocialIcon } from "@/components/marketing/social-icon";
import type { SocialLink } from "@/lib/dal/socials";
import { socialVerbKey } from "@/lib/socials/verb";

export async function SocialLinksSection({ links }: { links: SocialLink[] }) {
  if (links.length === 0) return null;
  const [t, tSocials] = await Promise.all([getTranslations("home"), getTranslations("socials")]);

  return (
    <section className="px-6 py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
            {t("socialsTitle")}
          </h2>
          <p className="max-w-[52ch] text-base text-muted-foreground">{t("socialsBody")}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <li key={link.id} className="min-w-0">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-3 rounded-2xl bg-sky-pale p-4 outline-none transition-colors hover:bg-sky-pale/70 focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <SocialIcon platform={link.platform} className="size-6 shrink-0 text-navy" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-display text-lg font-bold leading-tight">
                    {link.label}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {tSocials(socialVerbKey(link.platform))}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
