T3D.chrome('performance-hub.html','Performance Hub','Company KPIs and goals, every person, and a single on-track / off-track view.');
(async () => {
  const root=document.getElementById('root');
  root.innerHTML='<div class="loading">Loading…</div>';
  const deals=await T3D.getDeals(); T3D.setSource();
  const P=T3D.PLAN, fy=T3D.periodRange('year');
  // Shared with the team through the Nucleus (was this browser only)
  let actuals=await T3D.shared.load('kpi_actuals');

  // ---- derive live company KPI actuals ----
  const won=deals.filter(d=>d.status==='won'&&T3D.inRange(d.won_time||d.update_time,fy));
  const open=deals.filter(d=>d.status==='open');
  const rev=won.reduce((a,d)=>a+(d.value||0),0);
  const gp=won.reduce((a,d)=>a+(d._gp||0),0);
  const ceoOpen=open.filter(d=>(d.owner_name||'')==='Allan Rankin').length;
  const live={ rev, gp: rev?gp/rev*100:0, pipe: open.reduce((a,d)=>a+(d.value||0),0),
               ceo: open.length?(1-ceoOpen/open.length)*100:0 };

  const kpiActual=k=>{
    if(k.source==='pipedrive-won-fy') return live.rev;
    if(k.source==='pipedrive-gp')     return live.gp;
    if(k.source==='pipedrive-open')   return live.pipe;
    if(k.source==='pipedrive-owner')  return live.ceo;
    return actuals['co_'+k.id] ?? k.actual ?? null;
  };
  const fmt=(v,unit)=>v==null?'—':unit==='gbp'?T3D.gbpK(v):unit==='pct'?T3D.pct(v,unit==='pct'?1:0):
    unit==='score'?v.toFixed(1):Math.round(v).toLocaleString('en-GB');

  const statusOf=(a,t,lower)=>a==null?'grey':T3D.rag(a,t,{lowerIsBetter:!!lower,amber:.85});

  let tab='company';

  const companyView=()=>{
    const ks=PLAN_DATA.companyKPIs.map(k=>{
      const a=kpiActual(k), s=statusOf(a,k.target,k.lower);
      return {...k,a,s};
    });
    const counts={ok:0,warn:0,bad:0,grey:0}; ks.forEach(k=>counts[k.s]++);
    return `
    <div class="grid g4">
      <div class="card kpi ok"><h3>On track</h3><div class="big">${counts.ok}</div><div class="note">of ${ks.length} company KPIs</div></div>
      <div class="card kpi warn"><h3>At risk</h3><div class="big">${counts.warn}</div><div class="note">within 15% of target</div></div>
      <div class="card kpi bad"><h3>Off track</h3><div class="big">${counts.bad}</div><div class="note">needs intervention</div></div>
      <div class="card kpi"><h3>No data</h3><div class="big">${counts.grey}</div><div class="note">needs a number entering</div></div>
    </div>
    <div class="sect">Company KPIs <small>${P.fyLabel}</small></div>
    <div class="tw"><table><thead><tr><th>KPI</th><th class="num">Actual</th><th class="num">Target</th>
    <th style="width:180px">Attainment</th><th>Status</th><th>Note</th></tr></thead><tbody>
    ${ks.map(k=>{
      const p=k.target?(k.lower?Math.min(100,k.target/Math.max(k.a||1,1)*100):(k.a||0)/k.target*100):0;
      const editable=!String(k.source).startsWith('pipedrive');
      return `<tr><td><b>${k.name}</b>${k.stretch?`<div class="tiny">Stretch ${fmt(k.stretch,k.unit)}</div>`:''}</td>
        <td class="num">${editable?`<input class="btn" style="width:110px;text-align:right;padding:4px 8px"
          data-co="${k.id}" value="${k.a??''}">`:`<b>${fmt(k.a,k.unit)}</b>`}</td>
        <td class="num">${fmt(k.target,k.unit)}</td>
        <td><div class="bar" style="margin:0"><i class="${k.s}" style="width:${Math.min(100,Math.max(0,p))}%"></i></div>
          <div class="tiny">${isFinite(p)?T3D.pct(p,0):'—'}</div></td>
        <td><span class="chip ${k.s}">${T3D.ragLabel(k.s)}</span></td>
        <td class="tiny">${k.note||''}</td></tr>`;}).join('')}
    </tbody></table></div>
    <p class="tiny" style="margin-top:10px">Values shown in bold are live from Pipedrive. Editable fields are entered manually and saved in this browser.</p>`;
  };

  const statusView=()=>{
    const rows=[];
    PLAN_DATA.companyKPIs.forEach(k=>{
      const a=kpiActual(k); rows.push({who:'Company',kpi:k.name,a,t:k.target,unit:k.unit,
        s:statusOf(a,k.target,k.lower),freq:'—'});
    });
    T3D.PEOPLE.forEach(p=>{
      (PLAN_DATA.roleKPIs[p.id]||[]).forEach((k,i)=>{
        const a=actuals[`${p.id}_${i}`] ?? null;
        rows.push({who:p.name,kpi:k.k,a:a==null?null:+a,t:k.target,unit:k.unit,
          s:statusOf(a==null?null:+a,k.target,k.lower),freq:k.freq});
      });
    });
    const c={ok:0,warn:0,bad:0,grey:0}; rows.forEach(r=>c[r.s]++);
    const group=s=>rows.filter(r=>r.s===s);
    const block=(s,label,cls)=>{
      const g=group(s); if(!g.length) return '';
      return `<div class="sect">${label} <small>${g.length}</small></div>
      <div class="tw"><table><thead><tr><th>Who</th><th>KPI</th><th class="num">Actual</th>
      <th class="num">Target</th><th>Frequency</th></tr></thead><tbody>
      ${g.map(r=>`<tr><td><b>${r.who}</b></td><td>${r.kpi}</td>
        <td class="num">${fmt(r.a,r.unit)}</td><td class="num">${fmt(r.t,r.unit)}</td>
        <td class="tiny">${r.freq}</td></tr>`).join('')}</tbody></table></div>`;
    };
    return `
    <div class="grid g4">
      <div class="card kpi bad"><h3>Off track</h3><div class="big">${c.bad}</div><div class="note">deal with these first</div></div>
      <div class="card kpi warn"><h3>At risk</h3><div class="big">${c.warn}</div><div class="note">within 15% of target</div></div>
      <div class="card kpi ok"><h3>On track</h3><div class="big">${c.ok}</div><div class="note">meeting or beating target</div></div>
      <div class="card kpi"><h3>Awaiting data</h3><div class="big">${c.grey}</div><div class="note">no figure entered</div></div>
    </div>
    ${block('bad','Off track','bad')}${block('warn','At risk','warn')}
    ${block('grey','Awaiting a number','grey')}${block('ok','On track','ok')}`;
  };

  const personView=id=>{
    const p=T3D.PEOPLE.find(x=>x.id===id);
    const ks=PLAN_DATA.roleKPIs[id]||[];
    const wonP=won.filter(d=>d.owner_name===p.pdUser);
    const openP=open.filter(d=>d.owner_name===p.pdUser);
    return `
    <div class="grid g4">
      <div class="card kpi"><h3>Role</h3><div style="font-size:17px;font-weight:700;margin:8px 0 2px">${p.role}</div>
        <div class="note">${p.days?p.days+' days a week':'Contractor'}</div></div>
      <div class="card kpi"><h3>Revenue won (FY)</h3><div class="big">${T3D.gbpK(wonP.reduce((a,d)=>a+(d.value||0),0))}</div>
        <div class="note">${wonP.length} deals</div></div>
      <div class="card kpi"><h3>Open pipeline</h3><div class="big">${T3D.gbpK(openP.reduce((a,d)=>a+(d.value||0),0))}</div>
        <div class="note">${openP.length} deals</div></div>
      <div class="card kpi"><h3>Plan commitments owned</h3>
        <div class="big">${PLAN_DATA.milestones.filter(m=>m.owner===p.name).length}</div>
        <div class="note">see Plan and milestones</div></div>
    </div>
    <div class="sect">KPIs <small>re-based to the role as at August 2026</small></div>
    <div class="tw"><table><thead><tr><th>KPI</th><th>Frequency</th><th class="num">Actual</th>
    <th class="num">Target</th><th style="width:170px">Attainment</th><th>Status</th></tr></thead><tbody>
    ${ks.map((k,i)=>{
      const key=`${id}_${i}`; const a=actuals[key]==null?null:+actuals[key];
      const s=statusOf(a,k.target,k.lower);
      const p2=k.target?(k.lower?Math.min(100,k.target/Math.max(a||1,1)*100):(a||0)/k.target*100):0;
      return `<tr><td><b>${k.k}</b></td><td class="tiny">${k.freq}</td>
        <td class="num"><input class="btn" style="width:100px;text-align:right;padding:4px 8px" data-kpi="${key}" value="${actuals[key]??''}"></td>
        <td class="num">${fmt(k.target,k.unit)}</td>
        <td><div class="bar" style="margin:0"><i class="${s}" style="width:${Math.min(100,Math.max(0,p2))}%"></i></div></td>
        <td><span class="chip ${s}">${T3D.ragLabel(s)}</span></td></tr>`;}).join('')}
    </tbody></table></div>
    <div class="sect">Development commitment</div>
    <div class="card">${PLAN_DATA.cpd[id]||'To be agreed.'}</div>
    <div class="sect">Commitments owned in the plan</div>
    <div class="tw"><table><thead><tr><th>#</th><th>Commitment</th><th>Due</th><th>Progress</th></tr></thead><tbody>
    ${PLAN_DATA.milestones.filter(m=>m.owner===p.name).map(m=>
      `<tr><td class="mono">${m.n}</td><td><b>${m.t}</b><div class="tiny">${m.measure}</div></td>
       <td class="mono tiny">${T3D.dtShort(m.due)}</td>
       <td style="width:140px"><div class="bar" style="margin:0"><i style="width:${m.progress}%"></i></div></td></tr>`
    ).join('')||'<tr><td colspan="4" class="loading">None</td></tr>'}
    </tbody></table></div>`;
  };

  const render=()=>{
    const tabs=[['company','Company KPIs'],['status','On track / off track'],
      ...T3D.PEOPLE.map(p=>[p.id,p.name.split(' ')[0]])];
    root.innerHTML=`<div class="hz" style="margin-bottom:18px;gap:6px">
      ${tabs.map(([k,l])=>`<button class="btn ${k===tab?'pri':''}" data-t="${k}">${l}</button>`).join('')}</div>
      <div id="body"></div>`;
    document.getElementById('body').innerHTML =
      tab==='company'?companyView():tab==='status'?statusView():personView(tab);
    root.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render();});
    root.querySelectorAll('[data-kpi]').forEach(inp=>inp.onchange=()=>{
      const v=inp.value.trim(), k=inp.dataset.kpi; if(v==='') delete actuals[k]; else actuals[k]=+v;
      T3D.shared.patch('kpi_actuals',{[k]: v===''?null:+v}); render();});
    root.querySelectorAll('[data-co]').forEach(inp=>inp.onchange=()=>{
      const v=inp.value.trim(), k='co_'+inp.dataset.co; if(v==='') delete actuals[k]; else actuals[k]=+v;
      T3D.shared.patch('kpi_actuals',{[k]: v===''?null:+v}); render();});
  };
  render();
})();
