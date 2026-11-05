import { tokenFrom } from '../lib/session.mjs';
// POST /.netlify/functions/pipedrive-add-note
// Body: { dealId | leadId | projectId, content: string, html?: boolean, pinned?: boolean }
// Adds a note to one Pipedrive deal, lead or project.
//   - html: true  -> content is already HTML (Site visit notes) and is sent as is
//   - html: false -> plain text, wrapped in <pre> so line breaks survive (design
//                    and quote summaries; this is the default, as before)
//   - pinned: true -> pins the note to that record
// Older callers that send only { dealId, content } behave exactly as before.
// Uses the signed-in person's Pipedrive token (Nucleus session).
// © 2026 Ashley Keeler. All rights reserved.

export const handler = async function (event) {
  // Nucleus: runs as the signed-in person, with the Pipedrive token sealed in their session cookie.
  let token = null;
  try { token = await tokenFrom(event); } catch (e) { return json(503, { error: e.message }); }
  if (!token) return json(401, { error: 'Not signed in to the Nucleus. Sign in again with your Pipedrive API token.' });
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { dealId, leadId, projectId, content, html, pinned } = payload;
  const targets = [dealId, leadId, projectId].filter((v) => v != null && v !== '');
  if (targets.length !== 1 || !content) {
    return json(400, { error: 'content and exactly one of dealId, leadId or projectId are required' });
  }

  const body = { content: html ? String(content) : `<pre>${escapeHtml(content)}</pre>` };
  if (dealId != null && dealId !== '') { body.deal_id = Number(dealId); if (pinned) body.pinned_to_deal_flag = 1; }
  if (leadId != null && leadId !== '') { body.lead_id = String(leadId); if (pinned) body.pinned_to_lead_flag = 1; }
  if (projectId != null && projectId !== '') { body.project_id = Number(projectId); if (pinned) body.pinned_to_project_flag = 1; }

  try {
    const res = await fetch(`https://api.pipedrive.com/v1/notes?api_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || (data && data.success === false)) {
      return json(res.ok ? 400 : res.status, { error: data });
    }
    return json(200, { ok: true, note: data.data });
  } catch (err) {
    return json(502, { error: String(err) });
  }
};

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
