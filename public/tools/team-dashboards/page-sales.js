T3D.chrome('sales.html','Sales','Scoreboard, weekly pulse and deals report.');
(async () => {
  const root=document.getElementById('root');
  root.innerHTML='<div class="loading">Loading…</div>';
  const deals=await T3D.getDeals(); T3D.setSource();
  const P=T3D.PLAN;
  let tab='scoreboard';

  const owners=[...new Set(deals.map(d=>d.owner_name).filter(Boolean))].sort();

  const scoreboard=()=>{
    const fy=T3D.periodRange('year'), q=T3D.periodRange('quarter'), m=T3D.periodRange('month'), w=T3D.periodRange('week');
    const sum=(r,f='won')=>deals.filter(d=>d.status===f&&T3D.inRange(d.won_time||d.update_time,r)).reduce((a,d)=>a+(d.value||0),0);
    const gpsum=r=>deals.filter(d=>d.status==='won'&&T3D.inRange(d.won_time||d.update_time,r)).reduce((a,d)=>a+(d._gp||0),0);
    const rows=[
      ['Year to date', sum(fy), P.revBaseline, gpsum(fy)],
      ['This quarter', sum(q), P.revBaseline/4, gpsum(q)],
      ['This month',   sum(m), P.revBaseline/12, gpsum(m)],
      ['This week',    sum(w), P.revBaseline/52, gpsum(w)],
    ];
    const elapsed=Math.min(1,Math.max(0,(Date.now()-fy.from)/(fy.to-fy.from)));
    const pace=P.revBaseline*elapsed, ytd=sum(fy);

    // per-owner
    const byOwner=owners.map(o=>{
      const wn=deals.filter(d=>d.status==='won'&&d.owner_name===o&&T3D.inRange(d.won_time||d.update_time,fy));
      const op=deals.filter(d=>d.status==='open'&&d.owner_name===o);
      return {o, rev:wn.reduce((a,d)=>a+(d.value||0),0), gp:wn.reduce((a,d)=>a+(d._gp||0),0),
              n:wn.length, pipe:op.reduce((a,d)=>a+(d.value||0),0), pn:op.length};
    }).sort((a,b)=>b.rev-a.rev);

    return `
    <div class="grid g4">
      <div class="card kpi ${T3D.rag(ytd,pace,{amber:.85})}"><h3>Year to date</h3>
        <div class="big">${T3D.gbpK(ytd)}</div>
        <div class="note">Pace for £3.8m is ${T3D.gbpK(pace)} · ${ytd>=pace?'ahead':'behind'} by ${T3D.gbpK(Math.abs(ytd-pace))}</div>
        <div class="bar"><i class="${T3D.rag(ytd,pace,{amber:.85})}" style="width:${Math.min(100,ytd/P.revBaseline*100)}%"></i></div></div>
      <div class="card kpi"><h3>Still to find</h3><div class="big">${T3D.gbpK(Math.max(0,P.revBaseline-ytd))}</div>
        <div class="note">to the £3.8m floor · ${T3D.gbpK(Math.max(0,P.revStretch-ytd))} to £4.6m</div></div>
      <div class="card kpi"><h3>Gross profit YTD</h3><div class="big">${T3D.gbpK(gpsum(fy))}</div>
        <div class="note">${T3D.pct(ytd?gpsum(fy)/ytd*100:0)} blended</div></div>
      <div class="card kpi"><h3>Days left in FY</h3><div class="big">${Math.max(0,T3D.daysBetween(new Date(),fy.to))}</div>
        <div class="note">to 31 March 2027</div></div>
    </div>

    <div class="sect">Against target</div>
    <div class="tw"><table><thead><tr><th>Period</th><th class="num">Won</th><th class="num">Target</th>
    <th class="num">Variance</th><th class="num">GP</th><th style="width:170px">Attainment</th></tr></thead><tbody>
    ${rows.map(([l,v,t,g])=>{const p=t?v/t*100:0;const st=T3D.rag(v,t,{amber:.8});
      return `<tr><td><b>${l}</b></td><td class="num">${T3D.gbp(v)}</td><td class="num">${T3D.gbp(t)}</td>
      <td class="num" style="color:${v>=t?'#1f7a4d':'#b3261e'}">${v>=t?'+':'−'}${T3D.gbp(Math.abs(v-t))}</td>
      <td class="num">${T3D.gbp(g)}</td>
      <td><div class="bar" style="margin:0"><i class="${st}" style="width:${Math.min(100,p)}%"></i></div>
      <div class="tiny">${T3D.pct(p,0)}</div></td></tr>`;}).join('')}
    </tbody></table></div>

    <div class="sect">By owner <small>financial year to date</small></div>
    <div class="tw"><table><thead><tr><th>Owner</th><th class="num">Won</th><th class="num">Revenue</th>
    <th class="num">GP</th><th class="num">GP %</th><th class="num">Open deals</th><th class="num">Pipeline</th></tr></thead><tbody>
    ${byOwner.map(x=>`<tr><td><b>${x.o}</b></td><td class="num">${x.n}</td><td class="num">${T3D.gbp(x.rev)}</td>
      <td class="num">${T3D.gbp(x.gp)}</td><td class="num">${T3D.pct(x.rev?x.gp/x.rev*100:0,0)}</td>
      <td class="num">${x.pn}</td><td class="num">${T3D.gbp(x.pipe)}</td></tr>`).join('')}
    </tbody></table></div>`;
  };

  const pulse=()=>{
    const w=T3D.periodRange('week');
    const lw=T3D.periodRange('week',new Date(Date.now()-7*864e5));
    const f=(r,s)=>deals.filter(d=>d.status===s&&T3D.inRange(s==='won'?(d.won_time||d.update_time):d.update_time,r));
    const created=deals.filter(d=>T3D.inRange(d.add_time,w));
    const wonW=f(w,'won'), wonL=f(lw,'won'), lostW=f(w,'lost');
    const delta=(a,b)=>{const d=a-b;return `<span class="chip ${d>=0?'ok':'bad'}">${d>=0?'▲':'▼'} ${T3D.gbpK(Math.abs(d))}</span>`;};
    const wv=wonW.reduce((a,d)=>a+(d.value||0),0), lv=wonL.reduce((a,d)=>a+(d.value||0),0);
    const closing=deals.filter(d=>d.status==='open'&&d.expected_close_date&&
      T3D.daysBetween(new Date(),d.expected_close_date)>=0&&T3D.daysBetween(new Date(),d.expected_close_date)<=30)
      .sort((a,b)=>new Date(a.expected_close_date)-new Date(b.expected_close_date));

    return `
    <div class="grid g4">
      <div class="card kpi ${wv>=lv?'ok':'warn'}"><h3>Won this week</h3><div class="big">${T3D.gbpK(wv)}</div>
        <div class="note">${wonW.length} deals · vs last week ${delta(wv,lv)}</div></div>
      <div class="card kpi"><h3>New deals created</h3><div class="big">${created.length}</div>
        <div class="note">${T3D.gbpK(created.reduce((a,d)=>a+(d.value||0),0))} of new pipeline</div></div>
      <div class="card kpi ${lostW.length?'warn':'ok'}"><h3>Lost this week</h3><div class="big">${lostW.length}</div>
        <div class="note">${T3D.gbpK(lostW.reduce((a,d)=>a+(d.value||0),0))}</div></div>
      <div class="card kpi"><h3>Closing in 30 days</h3><div class="big">${closing.length}</div>
        <div class="note">${T3D.gbpK(closing.reduce((a,d)=>a+(d.value||0),0))} expected</div></div>
    </div>

    <div class="sect">Won this week</div>
    <div class="tw"><table><thead><tr><th>Project</th><th>Owner</th><th class="num">Value</th><th class="num">GP</th></tr></thead><tbody>
    ${wonW.length?wonW.map(d=>`<tr><td>${d.title}</td><td>${d.owner_name}</td><td class="num">${T3D.gbp(d.value)}</td>
      <td class="num">${d._gp!=null?T3D.gbp(d._gp):'—'}</td></tr>`).join(''):'<tr><td colspan="4" class="loading">Nothing closed yet this week</td></tr>'}
    </tbody></table></div>

    <div class="sect">Expected to close within 30 days</div>
    <div class="tw"><table><thead><tr><th>Project</th><th>Owner</th><th>Stage</th><th class="num">Value</th><th class="num">Expected</th><th class="num">Last touched</th></tr></thead><tbody>
    ${closing.slice(0,25).map(d=>{const st=T3D.daysBetween(d.update_time,new Date());
      return `<tr><td>${d.title}</td><td>${d.owner_name}</td><td><span class="chip info">${d.stage_name||'—'}</span></td>
      <td class="num">${T3D.gbp(d.value)}</td><td class="num tiny">${T3D.dtShort(d.expected_close_date)}</td>
      <td class="num"><span class="chip ${st>21?'bad':st>10?'warn':'ok'}">${st}d</span></td></tr>`;}).join('')
      ||'<tr><td colspan="6" class="loading">Nothing forecast to close in the next 30 days</td></tr>'}
    </tbody></table></div>`;
  };

  const dealsReport=()=>{
    const open=deals.filter(d=>d.status==='open');
    const cat=d=>{const age=T3D.daysBetween(d.update_time,new Date());
      if(!d.activities_count&&age>45) return 'dead';
      if(age>60) return 'stale'; if(age>21) return 'warm'; return 'hot';};
    const buckets={hot:[],warm:[],stale:[],dead:[]};
    open.forEach(d=>buckets[cat(d)].push(d));
    const box=(k,label,cls,action)=>{const b=buckets[k];
      return `<div class="card kpi ${cls}"><h3>${label}</h3><div class="big">${T3D.gbpK(b.reduce((a,d)=>a+(d.value||0),0))}</div>
      <div class="note">${b.length} deals · ${action}</div></div>`;};
    const list=k=>buckets[k].sort((a,b)=>(b.value||0)-(a.value||0)).slice(0,20).map(d=>
      `<tr><td>${d.title}</td><td>${d.owner_name}</td><td><span class="chip grey">${d.stage_name||'—'}</span></td>
      <td class="num">${T3D.gbp(d.value)}</td><td class="num">${d.activities_count||0}</td>
      <td class="num tiny">${T3D.daysBetween(d.update_time,new Date())}d</td></tr>`).join('');

    return `
    <div class="banner"><b>Commitment 3 — pipeline triage, due 19 September.</b>
    Delete the dead. Breakup-email everything stale and revive or kill within fourteen days.
    Every remaining deal gets a scheduled next action. Anything over £25,000 that revives goes to Allan or Jack.</div>
    <div class="grid g4">
      ${box('hot','Hot — touched in 21 days','ok','Allan and Jack close')}
      ${box('warm','Warm — 22 to 60 days','info','Charlie and Ashley nurture weekly')}
      ${box('stale','Stale — over 60 days','warn','Breakup email, revive or kill in 14 days')}
      ${box('dead','Dead — no activity, 45+ days','bad','Delete')}
    </div>
    ${['hot','warm','stale','dead'].map(k=>`
      <div class="sect">${{hot:'Hot',warm:'Warm',stale:'Stale',dead:'Dead'}[k]} <small>top 20 by value</small></div>
      <div class="tw"><table><thead><tr><th>Project</th><th>Owner</th><th>Stage</th>
      <th class="num">Value</th><th class="num">Activities</th><th class="num">Idle</th></tr></thead>
      <tbody>${list(k)||'<tr><td colspan="6" class="loading">None</td></tr>'}</tbody></table></div>`).join('')}`;
  };

  const render=()=>{
    const tabs=[['scoreboard','Revenue scoreboard'],['pulse','Weekly pulse'],['deals','Deals report']];
    root.innerHTML=`<div class="hz" style="margin-bottom:18px">
      ${tabs.map(([k,l])=>`<button class="btn ${k===tab?'pri':''}" data-t="${k}">${l}</button>`).join('')}</div>
      <div id="body"></div>`;
    document.getElementById('body').innerHTML =
      tab==='scoreboard'?scoreboard():tab==='pulse'?pulse():dealsReport();
    root.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render();});
  };
  render();
})();
