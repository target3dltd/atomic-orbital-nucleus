#!/usr/bin/env python3
"""Apply the Atomic Orbital skin to every tool and project page in public/ (v1.0.0).

Run from the nucleus folder:  python3 build/apply_ao_skin.py
Safe to run again: each page is skinned once (marked with <!-- ao-skin -->).
When you replace a tool with a newer version, run this again to re-skin it.

For each page it:
  - removes Google Fonts links (fonts are self-hosted in /brand/fonts),
  - adds the brand fonts, the skin base, the tool's skin and the theme sync before </head>,
  - swaps Target3D logos in the page's own chrome for the Atomic Orbital logo.
Client-facing output (quotes, proposals, SOW documents, 3D floor logos) is not touched.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
MARK = "<!-- ao-skin -->"

LOGO_PAIR = ('<img class="ao-logo-on-light" src="/brand/logos/svg/atomic-orbital-logo-for-light-backgrounds.svg" alt="Atomic Orbital">'
             '<img class="ao-logo-on-dark" src="/brand/logos/svg/atomic-orbital-logo-for-dark-backgrounds.svg" alt="Atomic Orbital">')

def repo_logo(s):
    # <a class="logo" ...><img src="data:..."></a>  → Atomic Orbital lockup pair
    s, n = re.subn(r'(<a class="logo"[^>]*aria-label=")Target3D([^"]*"[^>]*>)<img src="data:image/[^"]+"[^>]*>', r'\1Atomic Orbital\2' + LOGO_PAIR, s, count=1)
    if n != 1: raise SystemExit("repo logo not found")
    return s

def motive_logo(s):
    for cls, src in (("logo-light", "light"), ("logo-dark", "dark")):
        s, n = re.subn(r'<img class="%s" id="logo-%s" alt="Target3D" src="logo-%s\.png">' % (cls, src[0], src),
                       '<img class="%s" id="logo-%s" alt="Atomic Orbital" src="/brand/logos/svg/atomic-orbital-logo-for-%s-backgrounds.svg">' % (cls, src[0], src), s, count=1)
        if n != 1: raise SystemExit("motive logo %s not found" % cls)
    return s

def mocap_text(s):
    s = s.replace("Show Target3D logo on ground", "Show logo on ground")
    # keep the toolkit's own theme button label in step when the Nucleus theme changes
    head, sep, tail = s.rpartition("</body>")
    js = "<script>window.__aoMocapTheme=function(t){var b=document.getElementById('globalDarkThemeBtn');if(b)b.textContent=t==='dark'?'\\u2600 LIGHT THEME':'\\uD83C\\uDF19 DARK THEME'};</script>\n"
    return head + js + sep + tail

def sow_light(s):
    return s.replace('<html lang="en">', '<html lang="en" data-theme="light">', 1)

PAGES = {
    "projects/clays/index.html": dict(skin="t3d-repo", fix=repo_logo),
    "projects/lle/index.html": dict(skin="t3d-repo", fix=repo_logo),
    "projects/drift/index.html": dict(skin="t3d-repo", fix=repo_logo),
    "tools/process-map/index.html": dict(skin="process-map"),
    "tools/duplicate-eraser/index.html": dict(skin="merge-desk"),
    "tools/motive/index.html": dict(skin="motive", sync='data-keys="t3d-theme"', fix=motive_logo),
    "tools/mocap-toolkit/index.html": dict(skin="mocap", sync='data-keys="biomechanics_theme" data-body-dark="dark-theme" data-on-change="__aoMocapTheme"', fix=mocap_text),
    "tools/sow-builder/index.html": dict(skin="sow", sync=None, fix=sow_light),
    "tools/team-dashboards/index.html": dict(skin="team-dashboards"),
    "tools/team-dashboards/company.html": dict(skin="team-dashboards"),
    "tools/team-dashboards/performance-hub.html": dict(skin="team-dashboards"),
    "tools/team-dashboards/individual.html": dict(skin="team-dashboards"),
    "tools/team-dashboards/milestones.html": dict(skin="team-dashboards"),
    "tools/sales-hub/revenue-scoreboard.html": dict(skin="sales-hub", sync=None),
    "tools/sales-hub/pipeline-triage.html": dict(skin="sales-hub", sync=None),
    "tools/sales-hub/sales-report.html": dict(skin="sales-hub", sync=None),
    "tools/sales-hub/weekly-pulse.html": dict(skin="sales-hub", sync=None),
    "tools/sales-hub/weekly-deals-report.html": dict(skin="sales-hub", sync=None),
    "tools/sales-hub/supplier-forecast.html": dict(skin="sales-hub", sync=None),
    "tools/system-designer/index.html": dict(skin="system-designer", sync='data-keys="t3d-theme,t3d-sv-theme" data-attr="data-ui-theme"', skip=True),
}

GOOGLE = re.compile(r'\s*<link[^>]+(fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>')

def apply(rel, cfg):
    p = ROOT / rel
    s = p.read_text(encoding="utf8")
    if MARK in s:
        print("already skinned:", rel); return
    s = GOOGLE.sub("", s)
    skip = ' data-t3d-theme-skip' if cfg.get("skip") else ''
    tags = [MARK,
            f'<link rel="stylesheet" href="/brand/css/plex.css"{skip}>',
            f'<link rel="stylesheet" href="/nucleus/ao-skin/base.css"{skip}>',
            f'<link rel="stylesheet" href="/nucleus/ao-skin/{cfg["skin"]}.css"{skip}>']
    sync = cfg.get("sync", "")
    if sync is not None:
        tags.append(f'<script src="/nucleus/ao-skin/theme-sync.js" {sync}></script>'.replace("  ", " ").replace(" >", ">"))
    i = s.find("</head>")
    if i < 0: raise SystemExit("no </head> in " + rel)
    s = s[:i] + "\n".join(tags) + "\n" + s[i:]
    if cfg.get("fix"): s = cfg["fix"](s)
    p.write_text(s, encoding="utf8")
    print("skinned:", rel)

if __name__ == "__main__":
    only = sys.argv[1:]
    for rel, cfg in PAGES.items():
        if not only or any(o in rel for o in only):
            apply(rel, cfg)
