#!/usr/bin/env python3
"""Bring Allan's Target3D Sales Hub pages into the Nucleus (v1.0.0).

    python3 build/port_sales_hub.py <unzipped sales hub folder>
    python3 build/apply_ao_skin.py sales-hub

Copies the six reports to public/tools/sales-hub/ and, in each one:
  - removes the Firebase SDKs, firebase-config.js and auth-guard.js (the Nucleus gate signs people in),
  - loads hub.js (brand, Help, Sign out, shared store) instead,
  - points the Pipedrive proxy at /api/sales-hub/pipedrive,
  - serves SheetJS from /nucleus/vendor instead of a CDN,
  - Pipeline Triage: bucket overrides move from Firestore to the Nucleus store.
The landing page (index.html) is the Nucleus's own and is not copied.
Run it again whenever Allan sends a newer version.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "tools" / "sales-hub"
PAGES = ["revenue-scoreboard.html", "pipeline-triage.html", "sales-report.html",
         "weekly-pulse.html", "weekly-deals-report.html", "supplier-forecast.html"]

def must(s, old, new, count=1):
    if old not in s: raise SystemExit("expected text not found: " + old[:80])
    return s.replace(old, new, count)

def port(src: pathlib.Path, name: str):
    s = (src / name).read_text(encoding="utf8")
    s = re.sub(r'\s*<script src="https://www\.gstatic\.com/firebasejs/[^"]+"></script>', "", s)
    s = must(s, '<script src="firebase-config.js"></script>', "")
    s = re.sub(r"\s*<script>window\.PAGE_ACCESS = '[a-z]+';</script>", "", s)
    s = must(s, '<script src="auth-guard.js"></script>', '<script src="hub.js"></script>')
    s = s.replace('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', '/nucleus/vendor/xlsx-0.18.5.full.min.js')
    s = must(s, "const PD_PROXY = '/.netlify/functions/pipedrive';", "const PD_PROXY = '/api/sales-hub/pipedrive';")
    s = re.sub(r"<title>([^<|]+)\| Target3D Sales Hub</title>", r"<title>\1| Sales Hub · Nucleus</title>", s)
    s = s.replace('<div class="topnav-brand"><span>📊</span> Target3D Sales Hub</div>', '<div class="topnav-brand">Sales Hub</div>')
    # deal links: the company's Pipedrive address is target3d2 (some pages used target3d)
    s = s.replace("https://target3d.pipedrive.com/", "https://target3d2.pipedrive.com/")
    # every page's top bar starts with the Overview
    s = re.sub(r'(<div class="topnav-links">)', r'\1\n      <a href="./">📋 Overview</a>', s, count=1)
    s = s.replace('<html lang="en">', '<html lang="en-GB" data-theme="light">', 1)
    if name == "pipeline-triage.html":
        s = must(s, """const firebaseConfig = window.SALES_HUB_FIREBASE;
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();""", "// Bucket overrides are kept in the Nucleus store (SalesHubStore, from hub.js).")
        s = must(s, "await db.collection('settings').doc('pipeline-bucket-overrides').set({ overrides: bucketOverrides, updatedAt: new Date().toISOString() });",
                 "await SalesHubStore.set('settings/pipeline-bucket-overrides', { overrides: bucketOverrides, updatedAt: new Date().toISOString() });")
        s = must(s, """db.collection('settings').doc('pipeline-bucket-overrides').get().then(doc => {
  if (doc.exists) bucketOverrides = doc.data().overrides || {};
})""", """SalesHubStore.get('settings/pipeline-bucket-overrides').then(data => {
  if (data) bucketOverrides = data.overrides || {};
})""")
        s = s.replace("stored in Firebase", "stored in the Nucleus").replace("from Firebase", "from the Nucleus")
    for bad in ("firebase", "auth-guard", "/.netlify/functions/", "cdnjs.cloudflare.com"):
        if bad in s: raise SystemExit(f"{name}: still mentions {bad}")
    (OUT / name).write_text(s, encoding="utf8")
    print("ported:", name)

if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit(__doc__)
    src = pathlib.Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for n in PAGES: port(src, n)
