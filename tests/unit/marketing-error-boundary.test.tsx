import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketingErrorView } from "@/app/[locale]/(marketing)/error";

const props = {
  title: "Terjadi kesalahan",
  body: "Halaman ini gagal dimuat.",
  offlineHint: "Periksa koneksi internetmu.",
  retryLabel: "Coba lagi",
  onRetry: vi.fn(),
};

describe("MarketingErrorView", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the supplied copy without the offline hint when online", () => {
    const html = renderToStaticMarkup(<MarketingErrorView {...props} offline={false} />);
    expect(html).toContain("Terjadi kesalahan");
    expect(html).toContain("Coba lagi");
    expect(html).not.toContain("Periksa koneksi");
  });

  it("shows the offline hint only when offline", () => {
    const html = renderToStaticMarkup(<MarketingErrorView {...props} offline />);
    expect(html).toContain("Periksa koneksi internetmu.");
  });
});
