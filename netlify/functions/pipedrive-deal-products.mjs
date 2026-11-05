import { tokenFrom } from '../lib/session.mjs';
// /.netlify/functions/pipedrive-deal-products
// Adds a Quote Builder kit list to a Pipedrive deal as deal products, so the deal's
// own quote template can generate the quote.
//
//   POST { action:'match', dealId, skus:['PX13', ...], known:{ 'PX13': 1598 } }
//     -> { deal:{ id, title, currency }, custom:{...}|null,
//          results:{ SKU: { exact:[product...], similar:[product...] } } }
//        'known' are product ids already chosen for a SKU (remembered in the browser);
//        they are fetched by id and returned as the exact match.
//   GET  ?term=...                      (product picker: search by name or code)
//     -> { items:[product...] }
//   POST { action:'add', dealId, items:[{ product_id, item_price, quantity, tax,
//          discount, discount_type, comments }] }
//     -> { added: n }   (sent in batches of up to 100; existing deal products are kept)
//
// product = { id, name, code, prices:[{ price, currency }] }
// Uses the signed-in person's Pipedrive token (Nucleus session) (Netlify → Site settings → Environment variables).
// The token is sent in a header and never reaches the browser.
// © 2026 Ashley Keeler. All rights reserved.

const BASE = 'https://api.pipedrive.com';
const MAX_SKUS = 150;

export const handler = async function (event) {
  // Nucleus: runs as the signed-in person, with the Pipedrive token sealed in their session cookie.
  let token = null;
  try { token = await tokenFrom(event); } catch (e) { return json(503, { error: e.message }); }
  if (!token) return json(401, { error: 'Not signed in to the Nucleus. Sign in again with your Pipedrive API token.' });
  const headers = { 'x-api-token': token, Accept: 'application/json' };
  const api = async (path, opts = {}) => {
    const res = await fetch(BASE + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    let data = null; try { data = await res.json(); } catch (e) {}
    if (!res.ok || (data && data.success === false)) {
      const msg = (data && (data.error_info || data.error)) || ('Pipedrive returned ' + res.status);
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)); err.status = res.status; throw err;
    }
    return data || {};
  };

  try {
    if (event.httpMethod === 'GET') {
      const term = String((event.queryStringParameters || {}).term || '').trim();
      if (term.length < 2) return json(400, { error: 'term must be at least 2 characters' });
      const d = await api(`/api/v2/products/search?term=${encodeURIComponent(term)}&limit=20&include_fields=product.price`);
      return json(200, { items: items(d).map(shape) });
    }
    if (event.httpMethod !== 'POST') return json(405, { error: 'GET or POST only' });

    let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid JSON' }); }
    const dealId = String(body.dealId || '');
    if (!/^\d+$/.test(dealId)) return json(400, { error: 'dealId must be a deal number' });

    if (body.action === 'match') {
      const skus = [...new Set((body.skus || []).map((s) => String(s || '').trim()).filter(Boolean))];
      if (skus.length > MAX_SKUS) return json(400, { error: `Too many SKUs (max ${MAX_SKUS})` });
      const known = body.known && typeof body.known === 'object' ? body.known : {};
      const deal = (await api(`/api/v2/deals/${dealId}`)).data || {};

      // remembered choices: fetch those products by id (up to 100 per call)
      const knownIds = [...new Set(skus.map((s) => known[s]).filter((v) => /^\d+$/.test(String(v))).map(Number))];
      const byId = {};
      for (let i = 0; i < knownIds.length; i += 100) {
        const d = await api(`/api/v2/products?ids=${knownIds.slice(i, i + 100).join(',')}&limit=100`);
        (d.data || []).forEach((p) => { if (!p.is_deleted) byId[p.id] = shape(p); });
      }

      const results = {};
      const todo = skus.filter((s) => !(known[s] && byId[known[s]]));
      skus.forEach((s) => { if (known[s] && byId[known[s]]) results[s] = { exact: [byId[known[s]]], similar: [], remembered: true }; });
      await pool(todo, 5, async (sku) => {
        const d = await api(`/api/v2/products/search?term=${encodeURIComponent(sku)}&fields=code&limit=10&include_fields=product.price`);
        const all = items(d).map(shape);
        const exact = all.filter((p) => String(p.code || '').trim().toLowerCase() === sku.toLowerCase());
        const similar = all.filter((p) => exact.indexOf(p) === -1).slice(0, 6);
        results[sku] = { exact, similar };
      });

      // the catch-all "Custom" product for lines with no match
      let custom = null;
      try {
        const d = await api(`/api/v2/products/search?term=Custom&fields=name&exact_match=true&limit=5&include_fields=product.price`);
        custom = items(d).map(shape)[0] || null;
      } catch (e) {}

      return json(200, { deal: { id: deal.id, title: deal.title || '', currency: deal.currency || '' }, custom, results });
    }

    if (body.action === 'add') {
      const list = Array.isArray(body.items) ? body.items : [];
      if (!list.length) return json(400, { error: 'No products to add' });
      if (list.length > 500) return json(400, { error: 'Too many products (max 500)' });
      const clean = [];
      for (const it of list) {
        const pid = Number(it.product_id), price = Number(it.item_price), qty = Number(it.quantity);
        if (!Number.isInteger(pid) || pid <= 0) return json(400, { error: 'Each product needs a product_id' });
        if (!isFinite(price) || price < 0) return json(400, { error: 'Each product needs a price of 0 or more' });
        if (!isFinite(qty) || qty <= 0) return json(400, { error: 'Each product needs a quantity above 0' });
        const row = { product_id: pid, item_price: round(price), quantity: qty };
        if (it.tax != null && isFinite(Number(it.tax))) row.tax = Number(it.tax);
        if (it.discount != null && isFinite(Number(it.discount)) && Number(it.discount) > 0) {
          row.discount = Number(it.discount);
          row.discount_type = it.discount_type === 'amount' ? 'amount' : 'percentage';
        }
        if (it.comments) row.comments = String(it.comments).slice(0, 1000);
        clean.push(row);
      }
      let added = 0;
      for (let i = 0; i < clean.length; i += 100) {
        const d = await api(`/api/v2/deals/${dealId}/products/bulk`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: clean.slice(i, i + 100) }),
        });
        added += Array.isArray(d.data) ? d.data.length : clean.slice(i, i + 100).length;
      }
      return json(200, { added });
    }

    return json(400, { error: 'action must be match or add' });
  } catch (err) {
    const status = err.status === 404 ? 404 : err.status === 429 ? 429 : 502;
    return json(status, { error: status === 404 ? 'Deal not found' : String(err.message || err) });
  }
};

function items(d) { return ((d.data && d.data.items) || []).map((x) => x.item || x); }
function shape(p) {
  return {
    id: p.id, name: p.name || '', code: p.code || '',
    prices: (p.prices || []).map((x) => ({ price: Number(x.price) || 0, currency: x.currency || '' })),
  };
}
function round(n) { return Math.round(n * 100) / 100; }
async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
}
function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
