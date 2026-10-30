"use client";

import { useEffect } from "react";

// The root layout cannot know the locale without reading request headers,
// which would make every marketing page dynamic (and 500 on ISR routes), so it
// renders lang="en" and the localized layout corrects it here.
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
