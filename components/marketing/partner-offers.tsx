import { Handshake, Megaphone, Newspaper, Trophy } from "lucide-react";
import { getTranslations } from "next-intl/server";

const OFFERS = [
  { key: "sponsorship", Icon: Handshake },
  { key: "event", Icon: Trophy },
  { key: "brand", Icon: Megaphone },
  { key: "media", Icon: Newspaper },
] as const;

// The four tiles mirror the inquiry types so a visitor can map an offer to the
// form's "type" select.
export async function PartnerOffers() {
  const t = await getTranslations("partner");

  return (
    <section className="px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
          {t("offersTitle")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {OFFERS.map(({ key, Icon }) => (
            <li key={key} className="flex gap-4 rounded-2xl bg-sky-pale p-5">
              <span
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy text-white"
              >
                <Icon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="font-display text-xl font-bold leading-tight">
                  {t(`offers.${key}.title`)}
                </h3>
                <p className="text-base text-muted-foreground">{t(`offers.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
