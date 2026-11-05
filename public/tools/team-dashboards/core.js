/* ==========================================================
   Team Dashboards — shared core (in the Atomic Orbital Nucleus)
   Separate from the CEO Command Centre. Team-facing.
   Nucleus changes (v1.1.0): Pipedrive through /api/team/pipedrive behind the Nucleus sign-in;
   manual entries shared through /api/team/state instead of each browser; admin-only parts;
   Atomic Orbital header.
   ========================================================== */
const T3D = (() => {
  const FY_START = new Date('2026-04-01T00:00:00Z');
  const FY_END   = new Date('2027-03-31T23:59:59Z');

  // ---- plan constants (from Direction & Delivery, v1.0) ----
  const PLAN = {
    fyLabel: 'FY2026/27',
    revBaseline: 3800000,
    revStretch: 4600000,
    gpTargetPct: 32.9,
    gpCurrentPct: 31.3,
    breakEvenCash: 3600000,
    debtServiceMonthly: 28400,
    debtTotal: 1093067,
    overheadYear: 975865,
    actualQ1: 764945,
    retentionNow: 30, retentionTarget: 45,
    nrrNow: 68, nrrTarget: 85,
    ceoDealShareNow: 91, ceoDealShareTarget: 50,
  };

  const PEOPLE = [
    { id:'allan',   name:'Allan Rankin',            role:'CEO & Head of Sales and Marketing',        days:5,   pdUser:'Allan Rankin' },
    { id:'ashley',  name:'Ashley Keeler',           role:'Customer Success / Technical Director',    days:3.5, pdUser:'Ashley Keeler' },
    { id:'jack',    name:'Jack Weston',             role:'Technical Sales Manager',                  days:5,   pdUser:'Jack Weston' },
    { id:'sam',     name:'Sam Kaighin',             role:'Lead Systems Engineer',                    days:5,   pdUser:'Sam Kaighin' },
    { id:'ryan',    name:'Ryan Mercier',            role:'Curriculum Development & Studio Sales',    days:5,   pdUser:'Ryan Mercier' },
    { id:'ruslana', name:'Ruslana Bletska',         role:'Operations, Logistics & HR Manager',       days:5,   pdUser:'Ruslana Bletska' },
    { id:'sheryl',  name:'Sheryl Adie',             role:'Financial Controller',                     days:5,   pdUser:'Sheryl Adie' },
    { id:'charlie', name:'Charlie Wadey',           role:'Sales Development Representative',         days:2,   pdUser:'Charlie Wadey' },
    { id:'stacey',  name:'Stacey Davies-McKenzie',  role:'Bookkeeper & Finance Assistant',           days:3,   pdUser:'Stacey Davies-McKenzie' },
    { id:'rebecca', name:'Rebecca Flynn',           role:'Marketing (contract)',                     days:0,   pdUser:'Rebecca Flynn' },
  ];

  // ---- formatting ----
  const gbp = (n, dp=0) => (n<0?'−':'') + '£' + Math.abs(Math.round(n*(dp?100:1))/(dp?100:1))
      .toLocaleString('en-GB',{minimumFractionDigits:dp,maximumFractionDigits:dp});
  const gbpK = n => { const a=Math.abs(n); const s=n<0?'−':'';
    if(a>=1e6) return s+'£'+(a/1e6).toFixed(2)+'m';
    if(a>=1e3) return s+'£'+Math.round(a/1e3)+'k';
    return s+'£'+Math.round(a); };
  const pct = (n,dp=1) => (n==null||isNaN(n)?'—':n.toFixed(dp)+'%');
  const dt = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const dtShort = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : '—';
  const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/864e5);

  // ---- RAG ----
  function rag(actual, target, opts={}) {
    if (target === 0) return 'grey';
    const r = actual / target;
    const amber = opts.amber ?? 0.85, green = opts.green ?? 1;
    if (opts.lowerIsBetter) {
      if (actual <= target) return 'ok';
      if (actual <= target * 1.15) return 'warn';
      return 'bad';
    }
    if (r >= green) return 'ok';
    if (r >= amber) return 'warn';
    return 'bad';
  }
  const ragLabel = s => ({ok:'On track',warn:'At risk',bad:'Off track',grey:'No data'}[s]||'—');

  // ---- period helpers ----
  function periodRange(period, ref) {
    const now = ref ? new Date(ref) : new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    let from, to;
    if (period==='day')      { from=new Date(y,m,d);            to=new Date(y,m,d,23,59,59); }
    else if (period==='week'){ const dow=(now.getDay()+6)%7; from=new Date(y,m,d-dow); to=new Date(y,m,d-dow+6,23,59,59); }
    else if (period==='month'){from=new Date(y,m,1);            to=new Date(y,m+1,0,23,59,59); }
    else if (period==='quarter'){ const fq=Math.floor(((m-3+12)%12)/3); const sm=(3+fq*3)%12;
      const sy = m<3 ? y-1 : y; from=new Date(sy,sm,1); to=new Date(sy,sm+3,0,23,59,59); }
    else { from=new Date(m<3?y-1:y,3,1); to=new Date(m<3?y:y+1,2,31,23,59,59); }
    return {from,to};
  }
  const inRange=(d,r)=>{ if(!d) return false; const x=new Date(d); return x>=r.from && x<=r.to; };

  // ---- Pipedrive proxy ----
  let LIVE = true;
  const API = '/api/team/pipedrive';
  const signedOut = () => { try { window.top.postMessage({ nucleus: 'signed-out' }, location.origin); } catch (e) {} };
  async function pd(path, params={}) {
    const qs = new URLSearchParams({ path, ...params }).toString();
    const r = await fetch(`${API}?${qs}`, { credentials: 'same-origin' });
    if (r.status === 401) signedOut();
    if (!r.ok) throw new Error(`Pipedrive ${r.status}`);
    const j = await r.json();
    if (j.success === false) throw new Error(j.error || 'Pipedrive error');
    return j.data;
  }
  async function pdAll(path, params={}, cap=8) {
    let start=0, out=[], more=true, page=0;
    while (more && page<cap) {
      const q={...params,start,limit:500};
      const qs=new URLSearchParams({path,...q}).toString();
      const r=await fetch(`${API}?${qs}`, { credentials: 'same-origin' });
      if(r.status===401) signedOut();
      if(!r.ok) throw new Error(`Pipedrive ${r.status}`);
      const j=await r.json();
      out=out.concat(j.data||[]);
      const ap=j.additional_data&&j.additional_data.pagination;
      more=ap&&ap.more_items_in_collection; start=ap?ap.next_start:0; page++;
    }
    return out;
  }

  // ---- deal field mapping (label-based discovery, like Command Centre) ----
  const FIELD_LABELS = {
    cost:      ['Cost Price','Supplier Cost','Cost'],
    gpValue:   ['Expected GP Value','Expected GP','GP Value'],
    gpPct:     ['Expected GP %','GP %','Expected Gross Profit %'],
    supplier:  ['Main Supplier','Supplier'],
    enquiry:   ['Enquiry Type','Enquiry Source','Source'],
    projectNo: ['Project Number','Project #','Project No'],
    category:  ['Category','Deal Category','Project Category'],
  };
  let FIELDMAP = null;
  async function loadFieldMap() {
    if (FIELDMAP) return FIELDMAP;
    FIELDMAP = {};
    try {
      const fields = await pd('/dealFields');
      for (const [logical, labels] of Object.entries(FIELD_LABELS)) {
        const f = fields.find(x => labels.some(l => (x.name||'').toLowerCase() === l.toLowerCase()))
               || fields.find(x => labels.some(l => (x.name||'').toLowerCase().includes(l.toLowerCase())));
        if (f) FIELDMAP[logical] = f.key;
      }
    } catch(e){ console.warn('field map unavailable', e.message); }
    return FIELDMAP;
  }
  const fv = (deal, logical) => {
    const k = FIELDMAP && FIELDMAP[logical];
    if (!k) return null;
    const v = deal[k];
    return (v===''||v===undefined) ? null : v;
  };
  function dealGP(deal) {
    const g = parseFloat(fv(deal,'gpValue'));
    if (!isNaN(g) && g) return g;
    const c = parseFloat(fv(deal,'cost'));
    if (!isNaN(c) && c) return (deal.value||0) - c;
    return null;
  }

  // ---- demo fallback so pages render before Pipedrive is wired ----
  function demoDeals() {
    const owners = PEOPLE.filter(p=>['allan','jack','ashley','ryan','charlie','ruslana'].includes(p.id));
    const names = ['University of Cambridge','UCL Bartlett','Imperial College','King\'s College London',
      'Airbus Defence & Space','Ordnance Survey NI','Manchester Metropolitan','NFTS','BIMM Performers',
      'Little Lion Entertainment','ARUP','59 Productions','Sheffield NHS Podiatry','Royal Holloway',
      'Loughborough University','Futureworks Manchester','Open University','Rose Bruford','LIPA','UCA'];
    const cats = ['Tech Sales - PS','Tech Sales - SI','Studio Sales','Training'];
    const stages = ['Qualified','Proposal','Negotiation','Won','Lost'];
    const out=[]; let seed=42;
    const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    for(let i=0;i<120;i++){
      const won = rnd()<0.32, lost = !won && rnd()<0.18;
      const cat = cats[Math.floor(rnd()*cats.length)];
      const base = cat==='Studio Sales' ? 4000+rnd()*70000 : cat==='Training' ? 1500+rnd()*12000 : 500+rnd()*90000;
      const gpr = cat==='Studio Sales'?0.62+rnd()*0.25 : cat==='Training'?0.6+rnd()*0.3 : 0.16+rnd()*0.2;
      const dayOff = Math.floor(rnd()*250)-120;
      const d = new Date(); d.setDate(d.getDate()+dayOff);
      out.push({
        id:1000+i, title:`${names[Math.floor(rnd()*names.length)]} — ${cat}`,
        value:Math.round(base), currency:'GBP',
        status: won?'won':lost?'lost':'open',
        stage_name: won?'Won':lost?'Lost':stages[Math.floor(rnd()*3)],
        owner_name: owners[Math.floor(rnd()*owners.length)].pdUser,
        add_time:new Date(d.getTime()-rnd()*80*864e5).toISOString().slice(0,19).replace('T',' '),
        won_time: won? d.toISOString().slice(0,19).replace('T',' ') : null,
        update_time: d.toISOString().slice(0,19).replace('T',' '),
        expected_close_date: d.toISOString().slice(0,10),
        _cat:cat, _gp:Math.round(base*gpr),
        activities_count: rnd()<0.35?0:Math.ceil(rnd()*9),
      });
    }
    return out;
  }

  async function getDeals() {
    try {
      await loadFieldMap();
      const deals = await pdAll('/deals', { status:'all_not_deleted' });
      if (!deals.length) throw new Error('empty');
      LIVE = true;
      return deals.map(d => ({ ...d,
        _cat: (fv(d,'category') || d.pipeline_name || 'Uncategorised'),
        _gp: dealGP(d),
        owner_name: (d.user_id && d.user_id.name) || d.owner_name || 'Unassigned',
        activities_count: (d.activities_count ?? d.done_activities_count ?? 0),
      }));
    } catch (e) {
      console.warn('Falling back to sample data:', e.message);
      LIVE = false;
      return demoDeals();
    }
  }
  const isLive = () => LIVE;

  // ---- who is looking, and shared entries (Nucleus) ----
  let WHO = null;
  function who() {
    if (!WHO) WHO = fetch('/api/team/state', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => { if (r.status === 401) signedOut(); return r.json(); })
      .then(j => j && j.ok ? j : { ok:false, me:null, isAdmin:false, kpi_actuals:{}, kpi_notes:{}, milestones:{} })
      .catch(() => ({ ok:false, me:null, isAdmin:false, kpi_actuals:{}, kpi_notes:{}, milestones:{} }));
    return WHO;
  }
  function toast(msg, bad) {
    let t = document.getElementById('t3dtoast');
    if (!t) { t = document.createElement('div'); t.id = 't3dtoast'; t.setAttribute('role','status');
      t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);padding:10px 16px;border-radius:8px;font-size:14px;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.2)';
      document.body.appendChild(t); }
    t.textContent = msg; t.style.background = bad ? '#C2362B' : 'var(--ink)'; t.style.color = '#fff'; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, bad ? 4000 : 1800);
  }
  const shared = {
    async load(key) { const w = await who(); return Object.assign({}, (w && w[key]) || {}); },
    async patch(key, obj) {
      try {
        const r = await fetch('/api/team/state', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body: JSON.stringify({ key, patch: obj }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { toast(j.message || ('Not saved (' + r.status + ')'), true); return false; }
        toast('Saved for the team'); return true;
      } catch (e) { toast('Not saved: no connection', true); return false; }
    },
  };

  // ---- chrome ----
  const NAV = [
    ['index.html','Overview'],
    ['company.html','Company performance'],
    ['sales.html','Sales'],
    ['performance-hub.html','Performance Hub'],
    ['individual.html','My dashboard'],
    ['milestones.html','Plan & milestones'],
  ];
  function chrome(active, title, sub) {
    const tabs = NAV.map(([h,l]) => `<a href="${h}" class="${h===active?'on':''}">${l}</a>`).join('');
    document.body.insertAdjacentHTML('afterbegin', `
      <header class="top"><div class="wrap">
        <div class="brandrow">
          <div class="brand"><img class="ao-logo-on-light" src="/brand/logos/svg/atomic-orbital-logo-for-light-backgrounds.svg" alt="Atomic Orbital"><img class="ao-logo-on-dark" src="/brand/logos/svg/atomic-orbital-logo-for-dark-backgrounds.svg" alt="Atomic Orbital"><span>Team dashboards</span></div>
          <div class="spacer"></div>
          <div class="pill" id="datasrc">Loading…</div>
          <div class="pill">${PLAN.fyLabel} · target <b>${gbpK(PLAN.revBaseline)}</b> / stretch <b>${gbpK(PLAN.revStretch)}</b></div>
        </div>
        <nav class="tabs">${tabs}</nav>
      </div></header>
      <div class="wrap">
        <div class="phead"><div><h1 class="pt">${title}</h1><div class="sub">${sub||''}</div></div>
        <div class="spacer"></div>
        <button class="btn" onclick="location.reload()">Refresh</button></div>
        <div id="root"></div>
        <footer class="ft">Direction and Delivery · strictly private and confidential</footer>
      </div>`);
    // Performance Hub is for administrators
    who().then(w => { if (!w.isAdmin) document.querySelectorAll('nav.tabs a[href="performance-hub.html"]').forEach(a => a.remove()); });
  }
  function setSource() {
    const el=document.getElementById('datasrc'); if(!el) return;
    el.innerHTML = LIVE ? 'Live · <b>Pipedrive</b>' : 'Sample data · <b>connect Pipedrive</b>';
    el.style.background = LIVE ? 'rgba(80,200,140,.18)' : 'rgba(255,190,90,.2)';
  }

  return { PLAN, PEOPLE, gbp, gbpK, pct, dt, dtShort, daysBetween, rag, ragLabel,
           periodRange, inRange, pd, pdAll, getDeals, isLive, chrome, setSource, FY_START, FY_END, who, shared, toast };
})();
