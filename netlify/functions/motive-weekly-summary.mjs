// Every Monday at 07:00 UTC (07:00 GMT / 08:00 BST): post the weekly summary to Google Chat and/or email.
import { buildSummary, sendSummary } from "../lib/motive/summary.mjs";
export default async () => {
  try { const text = await buildSummary(); const sent = await sendSummary(text); console.log("weekly summary sent via", sent.join(", ") || "nothing configured"); }
  catch (e) { console.error("weekly summary failed:", e.message); }
};
export const config = { schedule: "0 7 * * 1" };
