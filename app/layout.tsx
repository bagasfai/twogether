import type { Metadata } from "next";
import { Barlow_Condensed, Figtree, Geist_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { getSiteUrl } from "@/lib/seo/urls";
import "./globals.css";

// Friendly rounded-geometric body face (replaces Geist Sans app-wide).
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

// Jersey-style display voice for the marketing site; the logo's script stays an image.
const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Absolute base for relative canonical/hreflang URLs. Omitted when unset or
// malformed so a bad env var never breaks the build (auth.ts already fails
// loudly in prod).
const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: "Jakbar Twogether",
  description: "Badminton community operations platform",
  openGraph: {
    siteName: "Jakbar Twogether",
    images: [{ url: "/brand/jakbar-twogether.jpeg", width: 640, height: 640, alt: "Jakbar Twogether" }],
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Only the (marketing) group under app/[locale] runs through the i18n
  // proxy; (app)/(auth)/auth routes fall back to the default locale here,
  // which is harmless since they aren't localized or SEO-indexed.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${figtree.variable} ${geistMono.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
