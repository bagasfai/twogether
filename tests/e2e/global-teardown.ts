import { sweepE2eData } from "./support/admin";

export default async function globalTeardown(): Promise<void> {
  await sweepE2eData();
}
