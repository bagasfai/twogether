import { describe, expect, it } from "vitest";
import { buildWhatsAppShareText } from "@/lib/format/whatsapp-share";

// 2026-09-19T02:00Z is 09:00 WIB (Asia/Jakarta, UTC+7) on a Saturday.
const session = {
  title: "Friday Night Badminton",
  startsAt: "2026-09-19T02:00:00.000Z",
  endsAt: "2026-09-19T04:00:00.000Z",
  location: "SBM Sport Club Citra",
  courtCount: 3,
  price: 45000 as number | null,
};

describe("buildWhatsAppShareText", () => {
  it("formats the date/time/location/courts/price header", () => {
    const lines = buildWhatsAppShareText(session, []).split("\n");
    expect(lines[0]).toBe("SABTU 19 SEPTEMBER");
    expect(lines[1]).toBe("🕑 09:00 - 11:00");
    expect(lines[2]).toBe("📍SBM Sport Club Citra");
    expect(lines[3]).toBe("LAP. A , B , C");
    expect(lines[4]).toBe("💰45.000");
  });

  it("omits the price line when price is null", () => {
    const text = buildWhatsAppShareText({ ...session, price: null }, []);
    expect(text).not.toContain("💰");
  });

  it("numbers confirmed players under LIST NAMA, marking paid ones with a checkmark", () => {
    const text = buildWhatsAppShareText(session, [
      { fullName: "Selvia", status: "confirmed", paidAt: "2026-09-15T00:00:00.000Z" },
      { fullName: "Yuda", status: "confirmed", paidAt: null },
    ]);
    expect(text).toContain("LIST NAMA\n1. Selvia ✅\n2. Yuda");
  });

  it("numbers waitlisted players under OPEN WL: with no checkmark", () => {
    const text = buildWhatsAppShareText(session, [
      { fullName: "Ichsan", status: "waiting_list", paidAt: null },
      { fullName: "Anton", status: "waiting_list", paidAt: "2026-09-15T00:00:00.000Z" },
    ]);
    expect(text).toContain("OPEN WL:\n1. Ichsan\n2. Anton");
  });

  it("omits the OPEN WL section entirely when there is no waitlist", () => {
    const text = buildWhatsAppShareText(session, [
      { fullName: "Selvia", status: "confirmed", paidAt: null },
    ]);
    expect(text).not.toContain("OPEN WL");
  });

  it("drops cancelled participants from both lists without any special-case filter", () => {
    const text = buildWhatsAppShareText(session, [
      { fullName: "Ghost", status: "cancelled", paidAt: null },
    ]);
    expect(text).not.toContain("Ghost");
  });

  it("generates court letters up to the 20-court cap without wrapping past Z", () => {
    const text = buildWhatsAppShareText({ ...session, courtCount: 20 }, []);
    expect(text.split("\n")[3]).toBe(
      "LAP. A , B , C , D , E , F , G , H , I , J , K , L , M , N , O , P , Q , R , S , T",
    );
  });
});
