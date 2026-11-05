import { guard, json, env } from "../lib/motive/lib.mjs";
export default async (req) => {
  const g = await guard(req); if (g) return g;
  return json({
    ok: true, host: "netlify", auth: env("SITE_PASSWORD") ? "site_password" : "netlify_visitor_access",
    pipedrive: true, user: req.nucleus ? req.nucleus.n : null,
    sheet: env("GOOGLE_SERVICE_ACCOUNT_JSON") || env("SHEET_APPS_SCRIPT_URL") ? "google" : env("SHEET_CSV_URL") ? "published" : "snapshot",
    summary: !!(env("GOOGLE_CHAT_WEBHOOK_URL") || (env("RESEND_API_KEY") && env("SUMMARY_EMAIL_TO"))),
  });
};
export const config = { path: "/api/motive/health" };
