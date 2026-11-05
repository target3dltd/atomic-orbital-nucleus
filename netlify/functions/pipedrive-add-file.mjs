import { tokenFrom } from '../lib/session.mjs';
// POST /.netlify/functions/pipedrive-add-file
// Body: { dealId | leadId, base64: string, filename: string, mimeType?: string }
// Uploads a file (a PNG screengrab, a quote PDF, a Site visit PDF) and attaches
// it to a Pipedrive deal or lead. Pipedrive's files endpoint doesn't document
// attaching to projects, so projects are refused rather than risk an unlinked
// upload. Uses the signed-in person's Pipedrive token (Nucleus session). Uses Node's
// built-in fetch/FormData/Blob (Node 18+, Netlify's default runtime).
//
// Note: Netlify functions have a combined request/response payload limit
// (6MB for standard synchronous functions at time of writing). A screengrab,
// quote or visit PDF fits easily; very large exports may not.
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

  const { dealId, leadId, projectId, base64, filename, mimeType } = payload;
  if (projectId != null && projectId !== '') {
    return json(400, { error: 'Files can only be attached to deals or leads' });
  }
  const hasDeal = dealId != null && dealId !== '', hasLead = leadId != null && leadId !== '';
  if (hasDeal === hasLead || !base64 || !filename) {
    return json(400, { error: 'base64, filename and exactly one of dealId or leadId are required' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
    const form = new FormData();
    form.append('file', blob, filename);
    if (hasDeal) form.append('deal_id', String(dealId));
    if (hasLead) form.append('lead_id', String(leadId));

    const res = await fetch(`https://api.pipedrive.com/v1/files?api_token=${token}`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (!res.ok || (data && data.success === false)) {
      return json(res.ok ? 400 : res.status, { error: data });
    }
    return json(200, { ok: true, file: data.data });
  } catch (err) {
    return json(502, { error: String(err) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
