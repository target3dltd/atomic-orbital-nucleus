import { tokenFrom } from '../lib/session.mjs';
// GET /.netlify/functions/pipedrive-search-deals?term=...
// Searches Pipedrive deals by term. Uses the signed-in person's Pipedrive token (Nucleus session) env var
// (Netlify site settings → Environment variables). Token never reaches
// the browser — this function runs server-side only.

export const handler = async function (event) {
  // Nucleus: runs as the signed-in person, with the Pipedrive token sealed in their session cookie.
  let token = null;
  try { token = await tokenFrom(event); } catch (e) { return json(503, { error: e.message }); }
  if (!token) return json(401, { error: 'Not signed in to the Nucleus. Sign in again with your Pipedrive API token.' });
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'GET only' });
  }

  const term = ((event.queryStringParameters || {}).term || '').trim();
  if (!term) {
    return json(400, { error: 'Missing "term" query parameter' });
  }

  try {
    const url = `https://api.pipedrive.com/v1/deals/search?term=${encodeURIComponent(term)}&api_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      return json(res.status, { error: data });
    }
    const items = ((data.data && data.data.items) || []).map((it) => {
      const d = it.item || {};
      return {
        id: d.id,
        title: d.title,
        org: d.organization && d.organization.name,
        person: d.person && d.person.name,
        status: d.status,
        value: d.value,
        currency: d.currency,
      };
    });
    return json(200, { deals: items });
  } catch (err) {
    return json(500, { error: String(err) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
