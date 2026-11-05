// "Send now" from the Summary page: builds and posts the summary immediately.
import { guard, json, fail } from "../lib/motive/lib.mjs";
import { buildSummary, sendSummary } from "../lib/motive/summary.mjs";
export default async (req) => {
  const g = await guard(req); if (g) return g;
  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only");
  try {
    const text = await buildSummary();
    const sent = await sendSummary(text);
    if (!sent.length) return fail(503, "not_configured", "No Google Chat webhook or email is set up in Netlify yet");
    return json({ ok: true, sent, text });
  } catch (e) { return fail(502, "upstream_error", String(e.message || e)); }
};
export const config = { path: "/api/motive/summary/send" };
