T3D.chrome('individual.html','My dashboard','Daily, weekly, monthly, quarterly and annual progress. Bring this to your monthly KPI meeting.');
(async () => {
  const root=document.getElementById('root');
  root.innerHTML='<div class="loading">Loading…</div>';
  const deals=await T3D.getDeals(); T3D.setSource();
  const LSP='t3d_me';
  // Shared through the Nucleus. Everyone sees their own page; administrators can open anyone's.
  const W=await T3D.who();
  let actuals=await T3D.shared.load('kpi_actuals'), notes=await T3D.shared.load('kpi_notes');
  let pref=null; try{pref=localStorage.getItem(LSP);}catch(e){}
  let me=W.isAdmin ? (pref||W.me||'ashley') : W.me;
  if (!T3D.PEOPLE.find(x=>x.id===me)) {
    if (W.isAdmin) me='ashley';
    else { root.innerHTML=`<div class="card"><h3>Not in the team list</h3><p>Your Pipedrive name (${W.name||'unknown'}) doesn't match anyone in the dashboard's team list, so there's no page for you yet. Ask an administrator to add you to <code>PEOPLE</code> in <code>core.js</code> and your KPIs to <code>plan-data.js</code>.</p></div>`; return; }
  }
  let period='month';

  const render=()=>{
    const p=T3D.PEOPLE.find(x=>x.id===me);
    const r=T3D.periodRange(period);
    const ks=PLAN_DATA.roleKPIs[me]||[];
    const mine=deals.filter(d=>d.owner_name===p.pdUser);
    const won=mine.filter(d=>d.status==='won'&&T3D.inRange(d.won_time||d.update_time,r));
    const open=mine.filter(d=>d.status==='open');
    const created=mine.filter(d=>T3D.inRange(d.add_time,r));
    const rev=won.reduce((a,d)=>a+(d.value||0),0);
    const gp=won.reduce((a,d)=>a+(d._gp||0),0);
    const stale=open.filter(d=>T3D.daysBetween(d.update_time,new Date())>21);
    const nextUp=open.filter(d=>d.expected_close_date)
      .sort((a,b)=>new Date(a.expected_close_date)-new Date(b.expected_close_date)).slice(0,10);

    const fmt=(v,unit)=>v==null||v===''?'—':unit==='gbp'?T3D.gbpK(+v):unit==='pct'?(+v).toFixed(0)+'%':
      unit==='score'?(+v).toFixed(1):(+v).toLocaleString('en-GB');
    const st=(a,k)=>a==null||a===''?'grey':T3D.rag(+a,k.target,{lowerIsBetter:!!k.lower,amber:.85});

    // which KPIs are relevant to the selected period
    const relevant=ks.map((k,i)=>({...k,i}))
      .filter(k=>period==='year'||period==='quarter'?true:
        (period==='month'? k.freq!=='quarterly' : ['weekly','daily'].includes(k.freq)|| k.freq==='monthly'));

    const noteKey=`${me}_${period}_${r.from.toISOString().slice(0,10)}`;

    root.innerHTML=`
    <div class="hz" style="margin-bottom:16px">
      ${W.isAdmin?`<select class="btn" id="who">${T3D.PEOPLE.map(x=>`<option value="${x.id}" ${x.id===me?'selected':''}>${x.name}</option>`).join('')}</select>`:''}
      <span class="tiny" style="font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-left:8px">View</span>
      ${['day','week','month','quarter','year'].map(x=>`<button class="btn ${x===period?'pri':''}" data-p="${x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}
      <span class="spacer" style="flex:1"></span>
      <span class="tiny">${T3D.dt(r.from)} — ${T3D.dt(r.to)}</span>
    </div>

    <div class="card" style="border-left:4px solid var(--navy);margin-bottom:18px">
      <div style="font-size:19px;font-weight:700">${p.name}</div>
      <div class="note">${p.role} · ${p.days?p.days+' days a week':'Contractor'}</div>
    </div>

    <div class="grid g4">
      <div class="card kpi"><h3>Revenue won</h3><div class="big">${T3D.gbpK(rev)}</div><div class="note">${won.length} deals this ${period}</div></div>
      <div class="card kpi"><h3>Gross profit</h3><div class="big">${T3D.gbpK(gp)}</div><div class="note">${T3D.pct(rev?gp/rev*100:0,0)} margin</div></div>
      <div class="card kpi"><h3>Open pipeline</h3><div class="big">${T3D.gbpK(open.reduce((a,d)=>a+(d.value||0),0))}</div><div class="note">${open.length} deals</div></div>
      <div class="card kpi ${stale.length?'warn':'ok'}"><h3>Needs attention</h3><div class="big">${stale.length}</div><div class="note">not touched in 21 days</div></div>
    </div>

    <div class="sect">My KPIs <small>${period === 'year' ? 'all' : 'relevant to this ' + period}</small></div>
    <div class="tw"><table><thead><tr><th>KPI</th><th>Frequency</th><th class="num">Actual</th><th class="num">Target</th>
    <th style="width:180px">Attainment</th><th>Status</th></tr></thead><tbody>
    ${relevant.map(k=>{
      const key=`${me}_${k.i}`; const a=actuals[key];
      const stt=st(a,k);
      const pp=k.target?(k.lower?Math.min(100,k.target/Math.max(+a||1,1)*100):(+a||0)/k.target*100):0;
      return `<tr><td><b>${k.k}</b></td><td class="tiny">${k.freq}</td>
        <td class="num"><input class="btn" style="width:100px;text-align:right;padding:4px 8px" data-kpi="${key}" value="${a??''}"></td>
        <td class="num">${fmt(k.target,k.unit)}</td>
        <td><div class="bar" style="margin:0"><i class="${stt}" style="width:${Math.min(100,Math.max(0,pp))}%"></i></div>
        <div class="tiny">${isFinite(pp)&&a!=null&&a!==''?T3D.pct(pp,0):'—'}</div></td>
        <td><span class="chip ${stt}">${T3D.ragLabel(stt)}</span></td></tr>`;}).join('')}
    </tbody></table></div>

    <div class="split" style="margin-top:22px">
      <div>
        <div class="sect">What I closed <small>this ${period}</small></div>
        <div class="tw"><table><thead><tr><th>Project</th><th class="num">Value</th><th class="num">GP</th></tr></thead><tbody>
        ${won.length?won.sort((a,b)=>(b.value||0)-(a.value||0)).map(d=>
          `<tr><td>${d.title}<div class="tiny">${T3D.dtShort(d.won_time||d.update_time)}</div></td>
           <td class="num">${T3D.gbp(d.value)}</td><td class="num">${d._gp!=null?T3D.gbp(d._gp):'—'}</td></tr>`).join('')
          :'<tr><td colspan="3" class="loading">Nothing closed in this period</td></tr>'}
        </tbody></table></div>
      </div>
      <div>
        <div class="sect">What is next <small>by expected close</small></div>
        <div class="tw"><table><thead><tr><th>Project</th><th class="num">Value</th><th class="num">Expected</th></tr></thead><tbody>
        ${nextUp.length?nextUp.map(d=>{const dd=T3D.daysBetween(new Date(),d.expected_close_date);
          return `<tr><td>${d.title}<div class="tiny">${d.stage_name||''}</div></td>
          <td class="num">${T3D.gbp(d.value)}</td>
          <td class="num"><span class="chip ${dd<0?'bad':dd<14?'warn':'grey'}">${T3D.dtShort(d.expected_close_date)}</span></td></tr>`;}).join('')
          :'<tr><td colspan="3" class="loading">Nothing scheduled</td></tr>'}
        </tbody></table></div>
      </div>
    </div>

    <div class="sect">Commitments I own in the plan</div>
    <div class="tw"><table><thead><tr><th>#</th><th>Commitment</th><th>Measure</th><th>Due</th><th style="width:130px">Progress</th></tr></thead><tbody>
    ${PLAN_DATA.milestones.filter(m=>m.owner===p.name).map(m=>{
      const dd=T3D.daysBetween(new Date(),m.due);
      return `<tr><td class="mono">${m.n}</td><td><b>${m.t}</b></td><td class="tiny">${m.measure}</td>
      <td class="mono tiny">${T3D.dtShort(m.due)} <span class="chip ${dd<0?'bad':dd<30?'warn':'grey'}">${dd<0?'overdue':dd+'d'}</span></td>
      <td><div class="bar" style="margin:0"><i class="${m.progress>=100?'ok':''}" style="width:${m.progress}%"></i></div></td></tr>`;
    }).join('')||'<tr><td colspan="5" class="loading">None</td></tr>'}
    </tbody></table></div>

    <div class="sect">Development commitment</div>
    <div class="card">${PLAN_DATA.cpd[me]||'To be agreed.'}</div>

    <div class="sect">Notes for the monthly KPI meeting <small>saved in this browser</small></div>
    <div class="card">
      <textarea id="notes" style="width:100%;min-height:130px;border:1px solid var(--line);border-radius:8px;
        padding:12px;font:14px/1.55 inherit;resize:vertical"
        placeholder="What went well. What got in the way. What support is needed. Priorities for next period.">${notes[noteKey]||''}</textarea>
      <div class="hz" style="margin-top:10px"><button class="btn pri" id="savenotes">Save notes</button>
      <span class="tiny" id="savedmsg"></span></div>
    </div>`;

    const whoSel=document.getElementById('who'); if(whoSel) whoSel.onchange=e=>{me=e.target.value;try{localStorage.setItem(LSP,me);}catch(err){}render();};
    root.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{period=b.dataset.p;render();});
    root.querySelectorAll('[data-kpi]').forEach(inp=>inp.onchange=()=>{
      const v=inp.value.trim(), k=inp.dataset.kpi; if(v==='') delete actuals[k]; else actuals[k]=+v;
      T3D.shared.patch('kpi_actuals',{[k]: v===''?null:+v}); render();});
    document.getElementById('savenotes').onclick=()=>{
      notes[noteKey]=document.getElementById('notes').value;
      T3D.shared.patch('kpi_notes',{[noteKey]: notes[noteKey]||null}).then(ok=>{
        document.getElementById('savedmsg').textContent=ok?'Saved '+new Date().toLocaleTimeString('en-GB'):'Not saved';});};
  };
  render();
})();
