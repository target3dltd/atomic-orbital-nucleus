# Atomic Orbital Nucleus (v1.10.1)

Software © 2026 Ashley Keeler. All rights reserved. The published pages are minified and carry this notice; see "The scramble build" below.

**First deployment runs at `https://atomic-orbital.netlify.app`** — that address is already allowed in the code. For any other address, add it to `T3D_NUCLEUS_HOSTS` in `public/tools/system-designer/index.html` and to `NUCLEUS_PUBLIC_URL` (below).

The Nucleus is Atomic Orbital's home for systems, processes and tooling. Team members sign in with **their own Pipedrive API token**. The hub sits at the centre, with three orbits around it:

| Orbit | What's in it |
|---|---|
| **Tools** (inner ring) | Operations processes, Checklists & templates, System Designer, SOW Builder, Pipedrive Duplicate Eraser, Motive licence renewals, Sales, Team performance, Support dashboard, Mocap Toolkit. |
| **Marketing** (shares the inner ring) | Assets & Press Kit: logos, colours, fonts, letterheads, the Brand Style Guide 2026 and press copy. |
| **Project sites** (middle ring) | Clays, Drift and Little Lion (LLE). |
| **Connected systems** (outer ring) | Pipedrive, QuickBooks, Google Drive, Gmail, the Operations Google Site, Netlify, Claude. These open in a new tab. |

## The home page (v1.9.0)

The hub is a launcher: greeting and your Pipedrive figures, a search bar (also `/` or Ctrl K / ⌘K) that finds any tool, project, system or Sales report, **Jump back in** (the last tools opened on that device, kept in the browser), tools grouped by **area**, and project sites and connected systems in the side column. The atom is still there as **Orbit view**, opened from the mark beside the greeting.

In `registry.js`: `areas` lists the groups in order; each tool has `area`, a one-line `short` for its tile, and optionally `featured: true` to lead its area and `links` (sub-pages that search can open directly, as the Sales reports do).

## Speed (v1.10.0)

- **Caching.** Tool and project pages are `private, no-cache` (the browser keeps them and gets a quick 304 when unchanged); their images, fonts, documents, scripts and styles are `private, max-age=86400`. These are set by the gate (`cacheFor` in `gate.js`), so caching never bypasses sign-in. `/nucleus/*` is cached a day and `/brand/*` a week (`netlify.toml`). Nothing is `no-store` any more.
- **Versioned links.** The build (`stampVersions` in `build/protect.mjs`) adds `?v=<content hash>` to every local `.js`/`.css` link in every page, so a deploy that changes a script is picked up immediately despite the caching.
- **Tool shell.** `launch.html` keeps the last four tools as hidden iframes; switching with the menu shows the kept one instantly and updates the address (Back/Forward work).
- **Prefetch.** Pointing at a tool on the home page prefetches its page.
- Still heavy on first visit: Drift (2.4 MB), System Designer (2.1 MB), Mocap Toolkit (1.6 MB) and Clays (1.5 MB) are single files with images embedded. Moving their images out to separate files would make first loads much quicker.

## What's in this folder

| Path | What it is |
|---|---|
| `public/index.html` | Sign-in page and hub (the atom, live Pipedrive figures, directory, Help) |
| `public/launch.html` | The frame a tool opens in: a Nucleus bar on top with the tool underneath |
| `public/nucleus/registry.js` | **The list of everything in the Nucleus.** Edit this to add or change tools. |
| `public/nucleus/nucleus.css`, `nucleus.js` | Nucleus styles and shared code (version number and changelog live in `nucleus.js`) |
| `public/nucleus/claude-shim.js` | Lets pages built as claude.ai artifacts run here (see "Adding a tool") |
| `public/brand/` | The Atomic Orbital brand kit (style sheet, fonts, logos) |
| `public/tools/…`, `public/projects/…` | The tools and project sites themselves |
| `netlify/functions/nucleus-*.mjs` | Sign-in, Pipedrive proxy, shared storage, colleague names, hub figures |
| `netlify/functions/pipedrive-*.mjs` | System Designer's Pipedrive functions |
| `netlify/functions/motive-*.mjs` | Motive Upgrade Planner's functions |
| `netlify/edge-functions/gate.js` | Blocks every tool and project page until you're signed in |
| `netlify/lib/` | Shared code (`session.mjs` is the security core) and a bundled copy of Netlify Blobs |
| `public/nucleus/dash-runtime.js`, `dash-runtime.css`, `vendor/d3-7.9.0.min.js` | Lets pages built with Claude's Dashboard type run here (used by the Support dashboard) |
| `netlify/functions/nucleus-gmail.mjs`, `netlify/lib/support/` | Reads the support@ inbox for the Support dashboard |
| `tests/` | `nucleus_test.mjs` (80 server checks against a fake Pipedrive) and a local test server |

## How sign-in works and why it's safe

**With Google sign-in configured** (recommended — set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`):

1. The person clicks **Sign in with Google**. Only accounts on `NUCLEUS_GOOGLE_DOMAINS` (default `target3d.co.uk,atomicorbital.co.uk`) are let in.
2. **The first time**, they're asked for their Pipedrive API token, once. The server checks it (company must be in `NUCLEUS_ALLOWED_COMPANIES`), then stores it **encrypted** (AES-256-GCM, key from `NUCLEUS_SECRET`) in the Nucleus store, keyed to their Google account id.
3. **Every time after**, Google alone signs them in: the stored token is re-checked with Pipedrive and the session begins. "Your account → Connect a different Pipedrive token" replaces it if they reset it in Pipedrive.
4. The session (name, token, Google identity, expiry) is sealed into an `HttpOnly; Secure; SameSite=Lax` cookie. Page code can never read the token, and it's never stored in the page or the browser. Sessions last `NUCLEUS_SESSION_DAYS` (default 7).

**Without Google** (until you set it up): the person signs in with their Pipedrive token alone (12 hours, or 30 days with "Keep me signed in"). The moment Google is configured, token-only sessions stop working and everyone uses Google.

**Either way:**
- The edge function `gate.js` turns away anyone without a valid session from `/tools/*`, `/projects/*` and `/launch.html`. Public pages: the sign-in page, the brand files, and System Designer's client 3D viewer (`/tools/system-designer/viewer.html`).
- **Admin-only** pages (listed in `gate.js` `ADMIN_ONLY`, currently the team Performance Hub) need an email in `NUCLEUS_ADMINS`.
- Every Pipedrive call from a tool runs **as that person**, so they only see what their Pipedrive permissions allow. (The team dashboards' company-wide figures are the exception — see "Team dashboards".)
- Changing `NUCLEUS_SECRET` signs everyone out and makes every stored token unreadable (everyone reconnects Pipedrive once), so set it once and keep it.

## Setting up Google sign-in

> **Live setup (5 Nov 2026):** Google Cloud project "My First Project" (`ancient-cortex-501112-e0`) under ashley.k@target3d.co.uk → Google Auth Platform: app "Atomic Orbital Nucleus", audience **Internal**, OAuth client "Nucleus (atomic-orbital.netlify.app)". Netlify has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NUCLEUS_PUBLIC_URL`, `NUCLEUS_ADMINS` (Ashley, Allan), `NUCLEUS_SECRET`, `PIPEDRIVE_API_TOKEN` (Ashley's token for now). Since 6 Nov 2026 the audience is **External, In production** (so separate atomicorbital.co.uk Google accounts can sign in), with home page `https://atomic-orbital.netlify.app/` and privacy notice `/privacy.html`. Nucleus itself still only admits the domains in `NUCLEUS_GOOGLE_DOMAINS`. The client has a second secret (created 5 Nov 23:14) in use; the first can be disabled and deleted.

Do this once, in a browser, after the site's address is final (`https://atomic-orbital.netlify.app`).

1. Go to **Google Cloud Console → APIs & Services → Credentials** (create a project first if needed, e.g. "Atomic Orbital Nucleus").
2. **Configure the OAuth consent screen**: User type **Internal** (keeps it to your Workspace), app name "Atomic Orbital Nucleus", your support email. Scopes: the default `openid`, `email`, `profile` are enough.
3. **Create credentials → OAuth client ID → Web application.**
   - Authorised JavaScript origins: `https://atomic-orbital.netlify.app`
   - Authorised redirect URI: `https://atomic-orbital.netlify.app/api/nucleus/google/callback`
4. Copy the **Client ID** and **Client secret** into Netlify as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, set `NUCLEUS_PUBLIC_URL` to `https://atomic-orbital.netlify.app`, and redeploy.
5. When you move to a custom domain later, add its origin and `/api/nucleus/google/callback` redirect URI in Google Cloud, and update `NUCLEUS_PUBLIC_URL` and `T3D_NUCLEUS_HOSTS`.

## Deploy to Netlify

1. Create a site called **`atomic-orbital`** so it serves at `https://atomic-orbital.netlify.app` (already allowed in the code). Any other name or custom domain must be added to `T3D_NUCLEUS_HOSTS` near the top of the first `<script>` in `public/tools/system-designer/index.html`, and to `NUCLEUS_PUBLIC_URL`.
2. Set the environment variables (Site configuration → Environment variables):

   | Variable | Required | Value |
   |---|---|---|
   | `NUCLEUS_SECRET` | **Yes** | A long random string, at least 32 characters. Generate one with `openssl rand -base64 48`. Keep it private; changing it signs everyone out and clears stored tokens. |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Google sign-in | From "Setting up Google sign-in" above. Leave unset to run token-only for now. |
   | `NUCLEUS_PUBLIC_URL` | With Google | The site's address, `https://atomic-orbital.netlify.app`. Used to build the Google callback URL. |
   | `NUCLEUS_GOOGLE_DOMAINS` | Optional | Google domains allowed in. Defaults to `target3d.co.uk,atomicorbital.co.uk`. |
   | `NUCLEUS_ADMINS` | Recommended | Admin emails, comma-separated (Google email with Google on; Pipedrive email otherwise). Suggested: `ashley.k@target3d.co.uk,allan@…`. Admins get the Performance Hub and can edit company KPIs and plan progress. |
   | `NUCLEUS_SALES_HUB_USERS` | Optional | Who can open the Sales Hub, comma-separated emails (administrators always can). Defaults to Allan, Ashley, Jack, Charlie, Sheryl and Ruslana at target3d.co.uk. |
   | `NUCLEUS_SESSION_DAYS` | Optional | How long a Google sign-in lasts on a device. Default 7. |
   | `NUCLEUS_ALLOWED_COMPANIES` | Recommended | Your Pipedrive company subdomain(s), comma-separated. Defaults to `target3d2`. If sign-in says a token belongs to a company that isn't allowed, the message names the company. Put that name here. |
   | `PIPEDRIVE_API_TOKEN` | For team company-wide figures | A read-only Pipedrive token used by the team dashboards and the Sales Hub so the company totals see every deal. Also used by Motive's Monday summary. Without it, each person's dashboards show only the deals their own token can see. |
   | `SHEET_APPS_SCRIPT_URL`, `SHEET_APPS_SCRIPT_TOKEN` | For Motive | The live serials sheet. The Apps Script is in `netlify/lib/motive/google-apps-script.gs`. Without these variables, Motive uses the snapshot from 2 Nov 2026. `GOOGLE_SERVICE_ACCOUNT_JSON` or `SHEET_CSV_URL` also work. |
   | `GOOGLE_CHAT_WEBHOOK_URL` and/or `RESEND_API_KEY`, `SUMMARY_EMAIL_TO`, `SUMMARY_EMAIL_FROM` | Optional | Motive's Monday summary |
   | `SUPPORT_GMAIL_APPS_SCRIPT_URL`, `SUPPORT_GMAIL_APPS_SCRIPT_TOKEN` | For the Support dashboard's inbox section | See "Support dashboard" below. |
| `SHEET_APPS_SCRIPT_URL` … | For Motive | The live serials sheet (see "What changed"). |

3. Deploy the **whole folder** (not just `public`). Netlify runs `npm install` then `npm run build` (the scramble build → `dist/`), and serves `dist/` with the functions and edge gate:
   ```bash
   npm install -g netlify-cli
   cd nucleus
   netlify login
   netlify link            # choose atomic-orbital
   netlify deploy --prod
   ```
   Or push the folder to a **private** GitHub repository and connect it (Add new site → Import an existing project). Netlify runs the build and redeploys on every push. (Drag-and-drop of a folder won't work — it skips the build and the functions.)
4. Check it:
   - `https://atomic-orbital.netlify.app/api/nucleus/me` should show a JSON `signedIn:false` (with `google:true` once Google is set). "Page not found" means the functions didn't deploy.
   - Open `https://atomic-orbital.netlify.app/tools/motive/` in a private window. You should land on the sign-in page.
   - Sign in and open each tool from the hub.
5. You don't need Netlify's own visitor password; the Nucleus sign-in replaces it. If you leave it on, people enter both.

## Adding a tool or project site

1. Put its files in `public/tools/<id>/` or `public/projects/<id>/` with an `index.html`.
2. In `public/nucleus/registry.js`, set that entry's `status` to `"live"`, or add a new entry. It appears in the atom and the directory automatically.
3. **If it was built as a claude.ai artifact** that uses the Pipedrive connector (`mcp.callTool`), the artifact database (`db`) or `user`, add this line before the page's own `<script>`:
   ```html
   <script src="/nucleus/claude-shim.js" data-ns="<id>"></script>
   ```
   Its Pipedrive calls then run with the signed-in person's token through `/api/nucleus/pd`, and its database is shared across the team in Netlify Blobs under its own namespace. This is how the Duplicate Eraser was moved in, almost unchanged. The Pipedrive tools on offer are listed at the top of `netlify/functions/nucleus-pd.mjs`. Add more there if a new tool needs them.
4. **If it has its own Netlify functions** that use `PIPEDRIVE_API_TOKEN`, change them to use the signed-in person's token instead: `import { tokenFrom } from "../lib/session.mjs"`, then `const token = await tokenFrom(event or req)`. See the `pipedrive-*.mjs` files for examples. Use paths under `/api/<id>/…` so they don't collide with other tools.
5. Bump the version in `public/nucleus/nucleus.js` (`N.VERSION` and `N.CHANGELOG`) and redeploy.

## Support dashboard

The Pipedrive half works as soon as the Nucleus is deployed: it reads the Support pipeline (pipeline 2) as whoever is signed in.

The support@ half needs connecting once. Until then it shows a note saying it isn't connected. In claude.ai each viewer's own Gmail was read; in the Nucleus people sign in with Pipedrive only, so the server reads the support@ mail instead. The Gmail search is fixed on the server (`SUPPORT_GMAIL_QUERY`, default: the dashboard's original search), so the page can't be used to read any other mail. Only subject, date, sender address and read state are sent, never message bodies.

**Easiest: Apps Script (about 5 minutes).**
1. Sign in to Google as someone who receives support@ mail, and open https://script.google.com → New project.
2. Paste in `netlify/lib/support/support-gmail-apps-script.gs`, change `TOKEN` to a long random string, and save.
3. Click Deploy → New deployment → Web app. Set Execute as: **Me** and Who has access: **Anyone**. Deploy and approve the permissions.
4. In Netlify, set `SUPPORT_GMAIL_APPS_SCRIPT_URL` (the web app URL) and `SUPPORT_GMAIL_APPS_SCRIPT_TOKEN` (the same string), then redeploy.

"Unread" then reflects that account's mailbox.

**If your Workspace blocks "Anyone" web apps:** use a Google service account with domain-wide delegation for `https://www.googleapis.com/auth/gmail.readonly` (Workspace admin console → Security → API controls). Set `GOOGLE_SERVICE_ACCOUNT_JSON` and `SUPPORT_GMAIL_USER` (the mailbox to read).

The **Sources** strip at the top of the dashboard shows where each number comes from, when it loaded, and offers Refresh and CSV for each source.

**Bringing in another Claude Dashboard:** copy its page (the HTML from the dashboard's store) into `<div id="dash-root">` of a page laid out like `public/tools/support-dashboard/index.html`, list its sources in `window.DASH_DATASETS`, and load `/nucleus/dash-runtime.js`. Pipedrive sources work as they are. Other connectors need a server function like `nucleus-gmail.mjs`.

## Assets & Press Kit (Marketing)

`public/tools/press-kit/` is a self-contained page in Atomic Orbital style, behind the same sign-in as the tools.

- `files/`: the downloads. These are the Brand Style Guide 2026 (PowerPoint, plus a PDF rendered from it), the UK letterheads (Word templates, plus PDF previews), and zips of the logos, the fonts, the web brand kit and the whole press kit.
- `img/`: slide and letterhead thumbnails rendered from those files.
- The press copy (tagline, boilerplates, key facts, mission, values, the six reasons) and the company details come from the Brand Style Guide 2026. When the guide changes, update the page's text and replace the files and thumbnails. The thumbnails are made with `soffice --convert-to pdf`, then `pdftoppm -jpeg -scale-to 960`.
- Logos on the page link to `/brand/logos/`. That folder is public, so a logo link can be sent to press directly.
- Not in the kit yet: business card artwork.

## Team dashboards (Sales dashboard + Team performance)

`public/tools/team-dashboards/` — six pages from the "Direction and Delivery" plan: Overview, Company performance, Sales, Performance Hub, My dashboard, and Plan & milestones. They appear in the hub as **Team performance**. Their Sales tab now opens the Sales tool (see "Sales" above).

What changed when they moved into the Nucleus:
- **Pipedrive** goes through `/api/team/pipedrive` (`netlify/functions/team-pipedrive.mjs`), behind the sign-in. Company-wide totals need to see every deal, so this uses the read-only `PIPEDRIVE_API_TOKEN` when set; otherwise it falls back to each person's own token and they see only their deals. Read-only: it allows `GET` on deals, fields, users, stages, pipelines, activities, organisations and persons, nothing else.
- **Shared entries.** The figures the dashboards can't get from Pipedrive (retention, cash, debt, every KPI actual, meeting notes, milestone progress) were saved per-browser. They now go through `/api/team/state` (`netlify/functions/team-state.mjs`) into the Nucleus store, shared across the team, with permissions: anyone reads company KPIs and plan progress; only **admins** write them; a person reads and writes only their own KPI actuals and notes; admins see and edit everyone's. A person is matched to the dashboard's team list by the first name on their Pipedrive user.
- **Admin-only:** the Performance Hub (hidden in the nav and blocked by `gate.js`). "My dashboard" shows the signed-in person their own page; admins get a people picker.
- The plan data (`plan-data.js`) and the team list (`PEOPLE` in `core.js`) are the files to edit when roles or KPIs change. The KPIs there were re-based to August 2026.

## Sales (the Sales Hub)

`public/tools/sales-hub/` — the single sales tool, shown in the hub as **Sales**. It opens on the **Sales overview** (`index.html` + `overview.js`), then Allan's six reports: Revenue Scoreboard, Pipeline Triage, Sales Report, Weekly Pulse, Weekly Deals Report and Supplier Forecast. Help is in `hub.js` (v1.1.0).

Since v1.8.0 the team dashboards' Sales page is merged in: its useful parts (gross profit, the by-owner table, deals closing in 30 days) live on the overview, `team-dashboards/sales.html` redirects here, and the Sales tab in Team performance links here (shown only to people with Sales access). Its simpler deals triage was dropped in favour of Pipeline Triage. The overview counts exactly what the Revenue Scoreboard counts (pipelines 1, 24 and 11, GBP, from 1 April 2026, £3.8m minimum and £4.56m stretch over 252 working days), so the two always agree. Note the plan in `team-dashboards/plan-data.js` says £4.6m stretch; the sales tools use Allan's £4.56m.

What changed when it moved in:
- **Deal links** point at `target3d2.pipedrive.com` (some pages used `target3d.pipedrive.com`).
- **Sign-in.** Firebase is gone (no Firebase project or `FIREBASE_WEB_API_KEY` needed). The edge gate lets in the people in `NUCLEUS_SALES_HUB_USERS` and every administrator; anyone else gets a "Sales Hub" notice, and the tool doesn't appear in their hub.
- **Pipedrive** goes through `/api/sales-hub/pipedrive` (`netlify/functions/sales-hub-pipedrive.mjs`). Reads (pipelines, stages, deals, deal fields, users, projects) use the shared read-only `PIPEDRIVE_API_TOKEN`. The one write, Pipeline Triage's probability change, is limited to `PUT /deals/<id>` with `probability` only, and is made with the signed-in person's own token so Pipedrive records who changed it. (Allan's proxy allowed any PUT/POST on those paths.)
- **Bucket overrides** in Pipeline Triage moved from Firestore to the Nucleus store (`sales-hub` namespace, Sales Hub people only).
- SheetJS (Excel export) is served from `/nucleus/vendor/` rather than a CDN; fonts are self-hosted; Atomic Orbital light theme.
- When Allan sends a newer version: unzip it, then `python3 build/port_sales_hub.py <folder>` and `python3 build/apply_ao_skin.py sales-hub`. Targets and pipeline names live in each report's own code.

## Checklists & templates (Operations)

`public/tools/checklists/` — the 19 operations checklists, reports and templates, rebranded to Atomic Orbital and grouped by process phase (enquiry, prove, deliver, support). Each has a Word download and a PDF preview; there's a download-all zip. Linked from the Operations process map.

To change one: edit the original `.docx`, then run `python3 build/rebrand_checklists.py <originals folder> <output folder>` (needs `python-docx`), which swaps in the Atomic Orbital logo, fonts, teal palette and legal footer, and re-render the PDF previews with `soffice --headless --convert-to pdf`. The embedded logo is `build/atomic-orbital-logo-docs.png` (a small copy, to keep file sizes down).

## The scramble build (copyright protection)

`npm run build` runs `build/protect.mjs`, which copies `public/` to `dist/` and, on the way, minifies every page and script and stamps `© 2026 Ashley Keeler. All rights reserved.` on each file. JavaScript is mangled and compressed with terser, CSS with clean-css, HTML with html-minifier-terser (inline scripts and styles minified too). Vendored libraries and already-minified files are left alone, and if any single file ever fails to minify it is copied unchanged so the site never breaks. Netlify runs this automatically and serves `dist/`. This slows casual copying and asserts the copyright; it is not strong protection against a determined reader, which client-side code can't have.

`public/` stays readable for editing and for the local dev server; `dist/` is the built output (git-ignored). Run `npm run build` to preview the built version locally with `NUCLEUS_PUBLIC_DIR=dist`.

## Atomic Orbital styling across the tools

Every tool and project site is restyled to the Atomic Orbital style sheet without rewriting it. A skin is layered on top of each one:

| File | What it does |
|---|---|
| `public/nucleus/ao-skin/base.css` | Atomic Orbital colours for light and dark. Font aliases make the families the tools were built with (Bebas Neue, Lato, Archivo, Bricolage Grotesque, Inter) draw Space Grotesk and IBM Plex Sans. |
| `public/nucleus/ao-skin/<tool>.css` | One skin per tool: colours, type, radius, buttons and the logo. Every selector starts `html:not(#ao-skin)`, so it outranks the tool's own CSS without editing it. |
| `public/nucleus/ao-skin/theme-sync.js` | Keeps each tool on the Nucleus light/dark choice, live and in both directions. It also handles each tool's own theme key (`t3d-theme`, `biomechanics_theme` and so on). |
| `public/brand/css/plex.css`, `public/brand/fonts/IBMPlex*` | IBM Plex Sans and Mono, self-hosted. The Nucleus no longer loads anything from Google Fonts. |
| `build/apply_ao_skin.py` | Wires a page to its skin and swaps the Target3D logo in the page's header for the Atomic Orbital logo. **Run it again (`python3 build/apply_ao_skin.py`) whenever you drop in a new version of a tool.** |

What is deliberately not changed: anything a tool produces for clients. That covers System Designer quotes, proposals and the logo on its 3D floor; the SOW Builder's documents, which use the logo and colours set in its own Settings; the Motive planner's emails; and the logo on the Mocap Toolkit's ground plane in exported renders. Those still say Target3D. Switching them is a separate decision, because company names and terms appear alongside the logo.

## What changed in the tools when they moved in

- **System Designer v2.104.2:** its 5 Pipedrive functions use the signed-in person's token instead of `PIPEDRIVE_API_TOKEN`. The domain lock also accepts the Nucleus addresses. Nothing else changed. The full edition contains prices, so this repository must stay private.
- **Pipedrive Duplicate Eraser (Account Merge Desk) v1.3.0:** runs on `claude-shim.js`, with the wording updated for the Nucleus. Approvals, dismissals and merge history are shared in the Nucleus store. History saved in the old claude.ai artifact doesn't carry over: undo any merges you need to reverse there.
- **Motive Upgrade Planner:** its APIs moved to `/api/motive/*`. They need a Nucleus session, and Pipedrive actions run as the signed-in person. The "me" name defaults to whoever is signed in. The shared tracker starts empty in the new store, so copy anything you need from the old Motive site, or keep that site running until you've moved over.
- **Support dashboard v1.2.0:** the same page, figures and Help, running on the Nucleus dashboard runtime in Atomic Orbital styling. The support@ inbox is now read by the server, which sees every message in a thread, not only the first five.
- **Mocap Toolkit v6.14.0:** unchanged. It is self-contained, and files you open in it never leave the browser. Live Capture still connects to `ws://localhost:8765` on the person's own computer. Browsers allow that from the Nucleus's https address because it's localhost.
- **Little Lion v1.0.0, Drift v1.0.0:** self-contained pages like Clays.
- **SOW Builder v4, Operations processes, Clays:** unchanged. SOW drafts stay in each person's browser, and AI Assist still uses the Anthropic key entered in the builder's own Settings.

## Testing

```bash
node tests/nucleus_test.mjs                     # 69 server checks against a fake Pipedrive (incl. Google sign-in, roles, team state)
NUCLEUS_SECRET=dev-secret-1234567890 MOCK_PD=1 node tests/devserver.mjs 8888
# open http://localhost:8888 and sign in with aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa (the fake Pipedrive's token)
npm run build && NUCLEUS_PUBLIC_DIR=dist NUCLEUS_SECRET=dev-secret-1234567890 MOCK_PD=1 node tests/devserver.mjs 8888   # preview the minified build
```
Without `MOCK_PD=1`, the local server talks to real Pipedrive with whatever token you sign in with. `netlify dev` also works.

## Still open

- Ruslana's address in the Sales Hub list (`ruslana.b@target3d.co.uk`) was marked unconfirmed in Allan's notes.
- Whether client-facing documents should move to Atomic Orbital branding (see "Atomic Orbital styling").
- Connecting the support@ inbox (see "Support dashboard").
- The role KPI documents, org chart and 100-day plan in the "KPIs and Operating Principles" pack are from Feb 2026 and largely superseded (the dashboards' KPIs are re-based to Aug 2026). Decide the current mission/values/strapline wording before adding a Company section.
- QuickBooks is a link for now. Pulling QuickBooks data into the Nucleus needs an Intuit developer app (OAuth), because there isn't a personal API token like Pipedrive's.
- The Operations Google Site is private, so the Nucleus links to it rather than copying its pages.

Software © 2026 Ashley Keeler. All rights reserved. Brand and company identity © 2026 Atomic Orbital Limited.
