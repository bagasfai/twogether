// Returns a JSON string for a schema.org FAQPage. Every "<" is escaped to
// the six-character sequence < so text like "</script>" cannot close the
// surrounding <script type="application/ld+json"> tag; JSON.parse restores it.
export function faqJsonLd(items: { question: string; answer: string }[]): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
