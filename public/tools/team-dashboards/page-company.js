T3D.chrome('company.html','Company performance','Sales and project delivery across the business, live from Pipedrive.');
(async () => {
  const root=document.getElementById('root');
  root.innerHTML='<div class="loading">Loading…</div>';
  const deals=await T3D.getDeals(); T3D.setSource();

  let period='year';
  const render=()=>{
    const r=T3D.periodRange(period);
    const won=deals.filter(d=>d.status==='won'&&T3D.inRange(d.won_time||d.update_time,r));
    const lost=deals.filter(d=>d.status==='lost'&&T3D.inRange(d.update_time,r));
    const open=deals.filter(d=>d.status==='open');
    const rev=won.reduce((a,d)=>a+(d.value||0),0);
    const gp=won.reduce((a,d)=>a+(d._gp||0),0);
    const winRate=(won.length+lost.length)?won.length/(won.length+lost.length)*100:0;
    const avg=won.length?rev/won.length:0;

    // by line
    const byCat={};
    won.forEach(d=>{const k=d._cat||'Uncategorised';(byCat[k]=byCat[k]||{n:0,rev:0,gp:0});
      byCat[k].n++;byCat[k].rev+=d.value||0;byCat[k].gp+=d._gp||0;});
    const cats=Object.entries(byCat).sort((a,b)=>b[1].rev-a[1].rev);

    // 80/20
    const sorted=[...won].sort((a,b)=>(b.value||0)-(a.value||0));
    const top20n=Math.max(1,Math.ceil(sorted.length*0.2));
    const top20rev=sorted.slice(0,top20n).reduce((a,d)=>a+(d.value||0),0);
    const top20gp=sorted.slice(0,top20n).reduce((a,d)=>a+(d._gp||0),0);
    const small=won.filter(d=>(d.value||0)<1000);
    const smallGP=small.reduce((a,d)=>a+(d._gp||0),0);

    // delivery
    const delivering=open.filter(d=>/deliver|install|progress|commission/i.test(d.stage_name||''));
    const stale=open.filter(d=>T3D.daysBetween(d.update_time,new Date())>60);
    const noAct=open.filter(d=>!d.activities_count);

    const kpi=(t,v,n,cls,bar)=>`<div class="card kpi ${cls||''}"><h3>${t}</h3><div class="big">${v}</div>
      <div class="note">${n||''}</div>${bar!=null?`<div class="bar"><i class="${cls||''}" style="width:${Math.min(100,bar)}%"></i></div>`:''}</div>`;

    root.innerHTML=`
    <div class="hz" style="margin-bottom:16px">
      <span class="tiny" style="font-weight:700;text-transform:uppercase;letter-spacing:.6px">Period</span>
      ${['day','week','month','quarter','year'].map(x=>`<button class="btn ${x===period?'pri':''}" data-p="${x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}
      <span class="tiny">${T3D.dt(r.from)} — ${T3D.dt(r.to)}</span>
    </div>

    <div class="grid g5">
      ${kpi('Revenue won',T3D.gbpK(rev),`${won.length} deals`,'')}
      ${kpi('Gross profit',T3D.gbpK(gp),T3D.pct(rev?gp/rev*100:0)+' margin',T3D.rag(rev?gp/rev*100:0,T3D.PLAN.gpTargetPct,{amber:.9}))}
      ${kpi('Win rate',T3D.pct(winRate,0),`${won.length} won · ${lost.length} lost`,T3D.rag(winRate,40,{amber:.8}))}
      ${kpi('Average deal',T3D.gbpK(avg),'per won deal','')}
      ${kpi('Open pipeline',T3D.gbpK(open.reduce((a,d)=>a+(d.value||0),0)),`${open.length} deals`,'')}
    </div>

    <div class="sect">Performance by line <small>where the gross profit actually comes from</small></div>
    <div class="tw"><table><thead><tr><th>Line</th><th class="num">Deals</th><th class="num">Revenue</th>
    <th class="num">Gross profit</th><th class="num">GP %</th><th class="num">% of total GP</th></tr></thead><tbody>
    ${cats.map(([k,v])=>{const m=v.rev?v.gp/v.rev*100:0;
      return `<tr><td><b>${k}</b></td><td class="num">${v.n}</td><td class="num">${T3D.gbp(v.rev)}</td>
      <td class="num">${T3D.gbp(v.gp)}</td><td class="num"><span class="chip ${m>=50?'ok':m>=32?'info':m>=25?'warn':'bad'}">${T3D.pct(m)}</span></td>
      <td class="num">${T3D.pct(gp?v.gp/gp*100:0,0)}</td></tr>`;}).join('')}
    <tr style="background:#f4f6f9"><td><b>Total</b></td><td class="num"><b>${won.length}</b></td>
    <td class="num"><b>${T3D.gbp(rev)}</b></td><td class="num"><b>${T3D.gbp(gp)}</b></td>
    <td class="num"><b>${T3D.pct(rev?gp/rev*100:0)}</b></td><td class="num">100%</td></tr>
    </tbody></table></div>

    <div class="split" style="margin-top:22px">
      <div><div class="sect">Revenue and margin by month</div>
        <div class="card"><canvas id="mChart" height="170"></canvas></div></div>
      <div><div class="sect">The 80/20 picture</div>
        <div class="card">
          <p style="margin:0 0 12px;font-size:14px">The top <b>${top20n}</b> deals (20% of won work) produced
          <b>${T3D.pct(rev?top20rev/rev*100:0,0)}</b> of revenue and <b>${T3D.pct(gp?top20gp/gp*100:0,0)}</b> of gross profit.</p>
          <div class="bar" style="height:12px"><i style="width:${gp?top20gp/gp*100:0}%"></i></div>
          <p style="margin:16px 0 0;font-size:14px">At the other end, <b>${small.length}</b> deals under £1,000
          produced <b>${T3D.gbp(smallGP)}</b> of gross profit between them —
          <b>${T3D.pct(gp?smallGP/gp*100:0,1)}</b> of the total.</p>
          <p class="tiny" style="margin-top:10px">Target3D World exists to take this tail off manual quoting.</p>
        </div></div>
    </div>

    <div class="sect">Delivery and pipeline health</div>
    <div class="grid g4">
      ${kpi('In delivery',delivering.length,T3D.gbpK(delivering.reduce((a,d)=>a+(d.value||0),0))+' in flight','info')}
      ${kpi('No activity logged',noAct.length,'open deals with nothing scheduled',noAct.length?'bad':'ok')}
      ${kpi('Stale (60+ days)',stale.length,T3D.gbpK(stale.reduce((a,d)=>a+(d.value||0),0))+' of face value',stale.length>20?'bad':stale.length?'warn':'ok')}
      ${kpi('Real pipeline',T3D.gbpK(open.filter(d=>d.activities_count&&T3D.daysBetween(d.update_time,new Date())<=60).reduce((a,d)=>a+(d.value||0),0)),'active, recently touched','ok')}
    </div>

    <div class="sect">Largest won deals <small>this period</small></div>
    <div class="tw"><table><thead><tr><th>Project</th><th>Owner</th><th>Line</th>
    <th class="num">Revenue</th><th class="num">GP</th><th class="num">GP %</th><th class="num">Closed</th></tr></thead><tbody>
    ${sorted.slice(0,15).map(d=>{const m=d.value?(d._gp||0)/d.value*100:0;
      return `<tr><td>${d.title}</td><td>${d.owner_name}</td><td class="tiny">${d._cat}</td>
      <td class="num">${T3D.gbp(d.value)}</td><td class="num">${d._gp!=null?T3D.gbp(d._gp):'—'}</td>
      <td class="num"><span class="chip ${m>=50?'ok':m>=25?'info':'warn'}">${d._gp!=null?T3D.pct(m,0):'—'}</span></td>
      <td class="num tiny">${T3D.dtShort(d.won_time||d.update_time)}</td></tr>`;}).join('')||'<tr><td colspan="7" class="loading">No won deals in this period</td></tr>'}
    </tbody></table></div>`;

    root.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{period=b.dataset.p;render();});

    // monthly chart
    const fy=T3D.periodRange('year'); const mm=[];
    for(let i=0;i<12;i++){const d=new Date(fy.from);d.setMonth(d.getMonth()+i);mm.push(d);}
    const mrev=[],mgp=[];
    mm.forEach(m=>{
      const rr={from:new Date(m.getFullYear(),m.getMonth(),1),to:new Date(m.getFullYear(),m.getMonth()+1,0,23,59,59)};
      const w=deals.filter(d=>d.status==='won'&&T3D.inRange(d.won_time||d.update_time,rr));
      const rv=w.reduce((a,d)=>a+(d.value||0),0); const g=w.reduce((a,d)=>a+(d._gp||0),0);
      mrev.push(rv); mgp.push(rv?g/rv*100:null);
    });
    new Chart(document.getElementById('mChart'),{
      data:{labels:mm.map(m=>m.toLocaleDateString('en-GB',{month:'short'})),
        datasets:[
          {type:'bar',label:'Revenue',data:mrev,backgroundColor:'#1F3355',borderRadius:4,yAxisID:'y'},
          {type:'line',label:'GP %',data:mgp,borderColor:'#B4472A',tension:.3,pointRadius:3,yAxisID:'y1'},
        ]},
      options:{responsive:true,plugins:{legend:{labels:{boxWidth:12,font:{size:11}}}},
        scales:{y:{ticks:{callback:v=>T3D.gbpK(v),font:{size:11}}},
          y1:{position:'right',min:0,max:80,grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%',font:{size:11}}},
          x:{ticks:{font:{size:11}}}}}});
  };
  render();
})();
