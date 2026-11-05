T3D.chrome('milestones.html','Plan and milestones','Direction and Delivery, August 2026 to March 2028. Every commitment, owner, date and status.');
(async () => {
  const root=document.getElementById('root');
  // Progress is shared through the Nucleus; administrators update it
  const W=await T3D.who();
  let prog=await T3D.shared.load('milestones');
  const P=m=>prog[m.n]!=null?prog[m.n]:m.progress;
  const today=new Date();
  let filter='all';
  T3D.setSource();

  const stOf=m=>{const pr=P(m),dd=T3D.daysBetween(today,m.due);
    if(pr>=100) return 'ok'; if(dd<0) return 'bad'; if(dd<=30) return 'warn'; return 'info';};
  const stLabel=m=>{const pr=P(m),dd=T3D.daysBetween(today,m.due);
    if(pr>=100) return 'Complete'; if(dd<0) return Math.abs(dd)+'d overdue'; return dd+'d left';};

  const render=()=>{
    const all=PLAN_DATA.milestones;
    const c={ok:0,warn:0,bad:0,info:0}; all.forEach(m=>c[stOf(m)]++);
    const shown=all.filter(m=>filter==='all'||m.h===filter);
    const owners=[...new Set(all.map(m=>m.owner))];

    const horizonCard=h=>{
      const ms=all.filter(m=>m.h===h.id);
      const done=ms.filter(m=>P(m)>=100).length;
      const avg=ms.length?ms.reduce((a,m)=>a+P(m),0)/ms.length:0;
      const late=ms.filter(m=>stOf(m)==='bad').length;
      return `<div class="card kpi ${late?'bad':avg>60?'ok':'warn'}">
        <h3>${h.label} · ${h.theme}</h3>
        <div class="big">${done} / ${ms.length}</div>
        <div class="note">${T3D.dtShort(h.from)} — ${T3D.dt(h.to)}${late?` · <b style="color:var(--bad)">${late} overdue</b>`:''}</div>
        <div class="bar"><i class="${late?'bad':avg>60?'ok':'warn'}" style="width:${avg}%"></i></div>
        <div class="tiny" style="margin-top:8px">${h.strap}</div></div>`;
    };

    root.innerHTML=`
    <div class="grid g3">${PLAN_DATA.horizons.map(horizonCard).join('')}</div>

    <div class="grid g4" style="margin-top:16px">
      <div class="card kpi ok"><h3>Complete</h3><div class="big">${c.ok}</div></div>
      <div class="card kpi bad"><h3>Overdue</h3><div class="big">${c.bad}</div></div>
      <div class="card kpi warn"><h3>Due within 30 days</h3><div class="big">${c.warn}</div></div>
      <div class="card kpi"><h3>Ahead of us</h3><div class="big">${c.info}</div></div>
    </div>

    <div class="sect">Fixed dates <small>contractual or structural — these cannot move</small></div>
    <div class="tw"><table><thead><tr><th style="width:130px">Date</th><th>Event</th>
    <th class="num" style="width:120px">Away</th></tr></thead><tbody>
    ${PLAN_DATA.fixedDates.map(f=>{const dd=T3D.daysBetween(today,f.d);const past=dd<0;
      return `<tr style="${past?'opacity:.45':''}"><td class="mono">${T3D.dt(f.d)}</td>
      <td>${f.crit?`<b>${f.t}</b>`:f.t}</td>
      <td class="num"><span class="chip ${past?'grey':f.crit?'bad':'info'}">${past?'passed':dd+' days'}</span></td></tr>`;}).join('')}
    </tbody></table></div>

    <div class="hz" style="margin:26px 0 12px">
      <span class="tiny" style="font-weight:700;text-transform:uppercase;letter-spacing:.6px">Horizon</span>
      <button class="btn ${filter==='all'?'pri':''}" data-f="all">All 28</button>
      ${PLAN_DATA.horizons.map(h=>`<button class="btn ${filter===h.id?'pri':''}" data-f="${h.id}">${h.label}</button>`).join('')}
      <span style="flex:1"></span>
      <button class="btn" id="reset">Reset progress</button>
    </div>

    <div class="tw"><table><thead><tr><th style="width:34px">#</th><th>Commitment</th><th>Owner</th>
    <th style="width:100px">Due</th><th style="width:210px">Progress</th><th style="width:110px">Status</th></tr></thead><tbody>
    ${shown.map(m=>{
      const st=stOf(m), pr=P(m);
      return `<tr><td class="mono">${m.n}</td>
      <td><b>${m.t}</b><div class="tiny">${m.measure}</div>
        <div class="tiny" style="margin-top:3px"><span class="chip grey">${PLAN_DATA.horizons.find(h=>h.id===m.h).label}</span></div></td>
      <td>${m.owner}</td>
      <td class="mono tiny">${T3D.dtShort(m.due)}<div class="tiny">${new Date(m.due).getFullYear()}</div></td>
      <td><input type="range" min="0" max="100" step="5" value="${pr}" data-m="${m.n}" style="width:150px;vertical-align:middle">
        <span class="mono tiny" style="margin-left:8px">${pr}%</span>
        <div class="bar" style="margin-top:6px"><i class="${st==='ok'?'ok':st==='bad'?'bad':st==='warn'?'warn':''}" style="width:${pr}%"></i></div></td>
      <td><span class="chip ${st}">${stLabel(m)}</span></td></tr>`;}).join('')}
    </tbody></table></div>

    <div class="sect">By owner</div>
    <div class="tw"><table><thead><tr><th>Owner</th><th class="num">Commitments</th><th class="num">Complete</th>
    <th class="num">Overdue</th><th style="width:200px">Average progress</th></tr></thead><tbody>
    ${owners.map(o=>{const ms=all.filter(m=>m.owner===o);
      const done=ms.filter(m=>P(m)>=100).length, late=ms.filter(m=>stOf(m)==='bad').length;
      const avg=ms.reduce((a,m)=>a+P(m),0)/ms.length;
      return `<tr><td><b>${o}</b></td><td class="num">${ms.length}</td><td class="num">${done}</td>
      <td class="num">${late?`<span class="chip bad">${late}</span>`:'—'}</td>
      <td><div class="bar" style="margin:0"><i class="${late?'bad':avg>60?'ok':'warn'}" style="width:${avg}%"></i></div>
      <div class="tiny">${Math.round(avg)}%</div></td></tr>`;}).join('')}
    </tbody></table></div>

    <p class="tiny" style="margin-top:14px">Progress is shared with the whole team.${W.isAdmin?' Drag a slider to update it.':' Only administrators can change it.'}</p>`;

    root.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.f;render();});
    root.querySelectorAll('[data-m]').forEach(sl=>{
      if(!W.isAdmin){sl.disabled=true;return;}
      sl.oninput=e=>{prog[sl.dataset.m]=+e.target.value;
        e.target.nextElementSibling.textContent=e.target.value+'%';
        const bar=e.target.parentElement.querySelector('.bar i'); bar.style.width=e.target.value+'%';};
      sl.onchange=e=>{T3D.shared.patch('milestones',{[sl.dataset.m]:+e.target.value});render();};
    });
    const rs=document.getElementById('reset');
    if(!W.isAdmin) rs.remove();
    else rs.onclick=()=>{if(confirm('Reset all progress to the plan defaults for everyone?')){const p={};Object.keys(prog).forEach(k=>p[k]=null);prog={};if(Object.keys(p).length)T3D.shared.patch('milestones',p);render();}};
  };
  render();
})();
