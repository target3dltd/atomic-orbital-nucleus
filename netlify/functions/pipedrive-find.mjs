import { tokenFrom } from '../lib/session.mjs';
// GET /.netlify/functions/pipedrive-find?type=deal|lead|project&term=...&limit=10
// GET /.netlify/functions/pipedrive-find?type=deal&id=10599
// Finds a Pipedrive deal, lead or project for the Site visit tab.
//   - id (deals only): fetches that deal directly  -> { item: {...} } or 404
//   - term: Pipedrive's search for that record type -> { items: [{ item: {...} }] }
// Each item is reduced to { id, title, organization:{name}, stage:{name}, status },
// the same shape the Site visit form reads. Projects report their phase as the stage.
// Uses the signed-in person's Pipedrive token (Nucleus session) (Netlify site settings →
// Environment variables). The token never reaches the browser.
// © 2026 Ashley Keeler. All rights reserved.

const BASE = 'https://api.pipedrive.com';
const TYPES = { deal: 'deals', lead: 'leads', project: 'projects' };

export const handler = async function (event) {
  // Nucleus: runs as the signed-in person, with the Pipedrive token sealed in their session cookie.
  let token = null;
  try { token = await tokenFrom(event); } catch (e) { return json(503, { error: e.message }); }
  if (!token) return json(401, { error: 'Not signed in to the Nucleus. Sign in again with your Pipedrive API token.' });
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });

  const q = event.queryStringParameters || {};
  const type = String(q.type || 'deal');
  if (!TYPES[type]) return json(400, { error: 'type must be deal, lead or project' });
  const limit = Math.max(1, Math.min(50, parseInt(q.limit, 10) || 10));
  const headers = { 'x-api-token': token, Accept: 'application/json' };

  try {
    // Direct lookup by deal number
    if (q.id != null && q.id !== '') {
      if (type !== 'deal' || !/^\d+$/.test(String(q.id))) return json(400, { error: 'id lookup is for deal numbers only' });
      const res = await fetch(`${BASE}/v1/deals/${encodeURIComponent(q.id)}`, { headers });
      if (res.status === 404) return json(404, { error: 'Deal not found' });
      const data = await res.json();
      if (!res.ok || !data || !data.data) return json(res.ok ? 404 : res.status, { error: (data && data.error) || 'Deal not found' });
      return json(200, { item: shape(data.data, type) });
    }

    const term = String(q.term || '').trim();
    if (term.length < 2) return json(400, { error: 'term must be at least 2 characters' });
    const url = `${BASE}/api/v2/${TYPES[type]}/search?term=${encodeURIComponent(term)}&limit=${limit}`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) return json(res.status, { error: (data && data.error) || data });
    const items = ((data.data && data.data.items) || []).map((x) => ({ item: shape(x.item || x, type) })).filter((x) => x.item.id != null);
    return json(200, { items });
  } catch (err) {
    return json(502, { error: String(err) });
  }
};

// Reduce a Pipedrive record to the fields the Site visit form shows.
function shape(d, type) {
  d = d || {};
  const orgName = d.organization ? d.organization.name : (d.org_name || (d.org_id && d.org_id.name) || '');
  const stageName = type === 'project' ? (d.phase && d.phase.name) : (d.stage && d.stage.name);
  return {
    id: d.id,
    title: d.title || '',
    organization: orgName ? { name: orgName } : null,
    stage: stageName ? { name: stageName } : null,
    status: d.status || '',
  };
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
