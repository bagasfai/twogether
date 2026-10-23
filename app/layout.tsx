import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { getSiteUrl } from "@/lib/seo/urls";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Only the (marketing) group under app/[locale] runs through the i18n
  // proxy; (app)/(auth)/auth routes fall back to the default locale here,
  // which is harmless since they aren't localized or SEO-indexed.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
