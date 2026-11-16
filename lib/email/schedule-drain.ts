import { after } from "next/server";
import { drainEmailOutbox } from "@/lib/email/drain-outbox";

export function scheduleEmailDrain(): void {
  after(async () => {
    try {
      await drainEmailOutbox();
    } catch (err) {
      console.error("email drain failed", err);
    }
  });
}
