import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES, type EmailContext, type EmailType } from "@/lib/email/templates/registry";

const ctx: EmailContext = {
  name: "Budi",
  sessionTitle: "Sabtu Pagi",
  startsAt: "2026-11-21T01:00:00Z",
  endsAt: "2026-11-21T03:00:00Z",
  location: "GOR Grogol",
  sessionUrl: "https://x.test/sessions/s1",
  profileUrl: "https://x.test/profile",
  payload: {
    waitlist_position: 2,
    old_starts_at: "2026-11-20T01:00:00Z",
    old_ends_at: "2026-11-20T03:00:00Z",
    old_location: "GOR Lama",
  },
};

async function html(type: EmailType, c: EmailContext = ctx) {
  return render(createElement(EMAIL_TEMPLATES[type].Component, { ctx: c }));
}

describe("email templates", () => {
  it.each(Object.keys(EMAIL_TEMPLATES))("%s renders with title and greeting", async (type) => {
    const t = EMAIL_TEMPLATES[type as EmailType];
    const out = await render(createElement(t.Component, { ctx }));
    expect(out).toContain("Sabtu Pagi");
    expect(out).toContain("Halo Budi");
    expect(t.subject(ctx).length).toBeGreaterThan(0);
  });

  it("registry covers all 8 types", () => {
    expect(Object.keys(EMAIL_TEMPLATES)).toHaveLength(8);
  });

  it("subjects match the spec", () => {
    const s = (t: EmailType) => EMAIL_TEMPLATES[t].subject(ctx);
    expect(s("registration_confirmed")).toBe("Pendaftaran kamu terkonfirmasi: Sabtu Pagi");
    expect(s("registration_waitlisted")).toBe("Kamu masuk daftar tunggu: Sabtu Pagi");
    expect(s("registration_cancelled")).toBe("Pendaftaran kamu dibatalkan: Sabtu Pagi");
    expect(s("waitlist_promoted")).toBe("Kamu dapat slot di Sabtu Pagi");
    expect(s("bumped")).toBe("Kamu dipindah ke daftar tunggu");
    expect(s("session_cancelled")).toBe("Sesi dibatalkan: Sabtu Pagi");
    expect(s("session_changed")).toBe("Perubahan jadwal sesi: Sabtu Pagi");
    expect(s("session_reminder")).toBe("Pengingat: Sabtu Pagi besok");
  });

  it("waitlisted shows the position", async () => {
    expect(await html("registration_waitlisted")).toContain("Urutan daftar tunggu: 2");
  });

  it("waitlisted omits the position when payload is empty", async () => {
    expect(await html("registration_waitlisted", { ...ctx, payload: {} })).not.toContain("Urutan daftar tunggu");
  });

  it("session_changed shows old and new venue", async () => {
    const out = await html("session_changed");
    expect(out).toContain("GOR Lama");
    expect(out).toContain("GOR Grogol");
  });

  it("session_cancelled has no session link", async () => {
    expect(await html("session_cancelled")).not.toContain(ctx.sessionUrl);
  });

  it("registration_cancelled keeps the session link", async () => {
    expect(await html("registration_cancelled")).toContain(ctx.sessionUrl);
  });

  it("session_reminder links to the profile page", async () => {
    const out = await html("session_reminder");
    expect(out).toContain(ctx.profileUrl);
    expect(out).toContain("Tidak ingin menerima pengingat?");
  });

  it("session_reminder puts the opt-out line after the summary and button", async () => {
    const out = await html("session_reminder");
    const optOut = out.indexOf("Tidak ingin menerima pengingat?");
    expect(optOut).toBeGreaterThan(out.indexOf("GOR Grogol"));
    expect(optOut).toBeGreaterThan(out.indexOf("Lihat sesi"));
  });

  it("bumped includes the formatted start date", async () => {
    expect(await html("bumped")).toContain("Sabtu, 21 November 2026");
  });

  it("renders without a name", async () => {
    expect(await html("registration_confirmed", { ...ctx, name: null })).toContain("Halo,");
  });
});
