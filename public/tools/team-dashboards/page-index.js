T3D.chrome('index.html','Overview','Where the company stands against the plan, today.');
(async () => {
  const root = document.getElementById('root');
  root.innerHTML = '<div class="loading">Loading…</div>';
  const deals = await T3D.getDeals(); T3D.setSource();
  const P = T3D.PLAN, fy = T3D.periodRange('year');

  const won = deals.filter(d => d.status==='won' && T3D.inRange(d.won_time||d.update_time, fy));
  const open = deals.filter(d => d.status==='open');
  const rev = won.reduce((a,d)=>a+(d.value||0),0);
  const gp  = won.reduce((a,d)=>a+(d._gp||0),0);
  const gpPct = rev ? gp/rev*100 : 0;
  const pipe = open.reduce((a,d)=>a+(d.value||0),0);
  const ceoDeals = open.filter(d=>(d.owner_name||'')==='Allan Rankin').length;
  const notCeo = open.length ? (1-ceoDeals/open.length)*100 : 0;

  // progress through the FY
  const elapsed = Math.min(1, Math.max(0, (Date.now()-fy.from)/(fy.to-fy.from)));
  const expected = P.revBaseline * elapsed;

  const ms = PLAN_DATA.milestones;
  const today = new Date();
  const overdue = ms.filter(m=>new Date(m.due)<today && m.progress<100).length;
  const dueSoon = ms.filter(m=>{const dd=T3D.daysBetween(today,m.due); return dd>=0&&dd<=45&&m.progress<100;}).length;

  const kpi=(t,v,note,cls,barPct)=>`<div class="card kpi ${cls||''}"><h3>${t}</h3><div class="big">${v}</div>
    <div class="note">${note||''}</div>${barPct!=null?`<div class="bar"><i class="${cls||''}" style="width:${Math.min(100,Math.max(0,barPct))}%"></i></div>`:''}</div>`;

  const revRag = T3D.rag(rev, expected, {amber:.85});
  const nextDates = PLAN_DATA.fixedDates
    .filter(f=>new Date(f.d)>=today).slice(0,6)
    .map(f=>`<tr><td class="mono" style="white-space:nowrap">${T3D.dt(f.d)}</td>
      <td>${f.crit?'<b>'+f.t+'</b>':f.t}</td>
      <td class="num"><span class="chip ${f.crit?'bad':'grey'}">${T3D.daysBetween(today,f.d)} days</span></td></tr>`).join('');

  root.innerHTML = `
  <div class="banner"><b>The one thing to watch.</b> Revenue visibility ends 30 September 2026.
  £2.04m — 56% of the year — is currently a flat monthly assumption. Commitment 2 replaces it with a
  bottom-up build by 12 September.</div>

  <div class="grid g4">
    ${kpi('Revenue — FY26/27', T3D.gbpK(rev), `${T3D.pct(elapsed*100,0)} through the year · pace ${T3D.gbpK(expected)}`, revRag, rev/P.revBaseline*100)}
    ${kpi('Gross margin', T3D.pct(gpPct), `Target ${T3D.pct(P.gpTargetPct)} · running ${T3D.pct(P.gpCurrentPct)}`, T3D.rag(gpPct,P.gpTargetPct,{amber:.9}), gpPct/P.gpTargetPct*100)}
    ${kpi('Open pipeline', T3D.gbpK(pipe), `${open.length} open deals`, T3D.rag(pipe,1140000,{amber:.7}), pipe/1140000*100)}
    ${kpi('Deals not held by the CEO', T3D.pct(notCeo,0), `Target 50% by Mar 2027 · ${ceoDeals} of ${open.length} with Allan`, T3D.rag(notCeo,50,{amber:.6}), notCeo/50*100)}
  </div>

  <div class="grid g4" style="margin-top:16px">
    ${kpi('Retention', '30%', 'Target 45% — worth £248k a year', 'bad', 30/45*100)}
    ${kpi('Net revenue retention', '68%', 'Healthy B2B is above 100%', 'bad', 68/85*100)}
    ${kpi('Total debt', T3D.gbpK(P.debtTotal), `£${P.debtServiceMonthly.toLocaleString('en-GB')} a month · reducing`, 'warn')}
    ${kpi('Plan commitments', `${ms.filter(m=>m.progress>=100).length} / ${ms.length}`, `${overdue} overdue · ${dueSoon} due within 45 days`, overdue?'bad':dueSoon?'warn':'ok', ms.filter(m=>m.progress>=100).length/ms.length*100)}
  </div>

  <div class="split" style="margin-top:22px">
    <div>
      <div class="sect">Revenue against plan <small>won deals, cumulative</small></div>
      <div class="card"><canvas id="revChart" height="150"></canvas></div>
    </div>
    <div>
      <div class="sect">What is coming <small>fixed dates that cannot move</small></div>
      <div class="tw"><table><thead><tr><th>Date</th><th>Event</th><th class="num">Away</th></tr></thead>
      <tbody>${nextDates}</tbody></table></div>
    </div>
  </div>

  <div class="sect">Active commitments <small>short-term horizon, August–September 2026</small></div>
  <div class="tw"><table><thead><tr><th>#</th><th>Commitment</th><th>Owner</th><th>Due</th><th style="width:150px">Progress</th><th>Status</th></tr></thead><tbody>
  ${ms.filter(m=>m.h==='short').map(m=>{
    const dd=T3D.daysBetween(today,m.due);
    const st = m.progress>=100?'ok':dd<0?'bad':dd<=21?'warn':'info';
    return `<tr><td class="mono">${m.n}</td><td><b>${m.t}</b><div class="tiny">${m.measure}</div></td>
      <td>${m.owner}</td><td class="mono" style="white-space:nowrap">${T3D.dtShort(m.due)}</td>
      <td><div class="bar" style="margin:0"><i class="${st==='bad'?'bad':st==='warn'?'warn':'ok'}" style="width:${m.progress}%"></i></div>
      <div class="tiny">${m.progress}%</div></td>
      <td><span class="chip ${st}">${m.progress>=100?'Done':dd<0?'Overdue':dd+'d left'}</span></td></tr>`;
  }).join('')}
  </tbody></table></div>`;

  // cumulative chart
  const months=[]; for(let i=0;i<12;i++){const d=new Date(fy.from);d.setMonth(d.getMonth()+i);months.push(d);}
  const cum=[]; let run=0;
  months.forEach(m=>{
    const end=new Date(m.getFullYear(),m.getMonth()+1,0,23,59,59);
    run = won.filter(d=>new Date(d.won_time||d.update_time)<=end).reduce((a,d)=>a+(d.value||0),0);
    cum.push(end>new Date()? null : run);
  });
  new Chart(document.getElementById('revChart'),{type:'line',
    data:{labels:months.map(m=>m.toLocaleDateString('en-GB',{month:'short'})),
      datasets:[
        {label:'Actual (cumulative)',data:cum,borderColor:T3D.color('--ao-teal','#04959B'),backgroundColor:T3D.color('--ao-teal-soft','rgba(4,149,155,.12)'),fill:true,tension:.3,spanGaps:false,pointRadius:3},
        {label:'£3.8m baseline pace',data:months.map((_,i)=>3800000/12*(i+1)),borderColor:T3D.color('--ao-orange','#F2531A'),borderDash:[5,4],pointRadius:0,tension:0},
        {label:'£4.6m stretch pace',data:months.map((_,i)=>4600000/12*(i+1)),borderColor:T3D.color('--ao-meridian','#9AA9B8'),borderDash:[2,4],pointRadius:0,tension:0},
      ]},
    options:{responsive:true,plugins:{legend:{labels:{boxWidth:12,font:{size:11}}}},
      scales:{y:{ticks:{callback:v=>T3D.gbpK(v),font:{size:11}}},x:{ticks:{font:{size:11}}}}}});
})();
