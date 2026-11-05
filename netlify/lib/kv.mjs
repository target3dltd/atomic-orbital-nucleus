// Shared Netlify Blobs store for the Nucleus (or a local JSON file when NUCLEUS_LOCAL_STORE is set, for tests).
import * as fs from "node:fs";

let storeP = null;
export async function kv() {
  if (!storeP) storeP = (async () => {
    if (process.env.NUCLEUS_LOCAL_STORE) return localStore(process.env.NUCLEUS_LOCAL_STORE);
    const { getStore } = await import("./blobs.mjs");
    return getStore({ name: "nucleus", consistency: "strong" });
  })();
  return storeP;
}

function localStore(file) {
  const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return {}; } };
  const save = (o) => fs.writeFileSync(file, JSON.stringify(o));
  return {
    async list({ prefix }) { return { blobs: Object.keys(load()).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async get(k) { const o = load(); return k in o ? o[k] : null; },
    async setJSON(k, v) { const o = load(); o[k] = v; save(o); },
    async delete(k) { const o = load(); delete o[k]; save(o); },
  };
}
