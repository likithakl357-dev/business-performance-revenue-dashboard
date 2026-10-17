/* Executive summary enhancement layer. Original dashboard logic remains the source of truth. */
(function () {
  const baseRender = window.renderDashboard;
  if (typeof baseRender !== "function") return;
  const fmtMoney = value => new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 }).format(Math.round(value || 0));
  const fmtNum = value => new Intl.NumberFormat("en-IN").format(value || 0);
  const safePct = (a,b) => b ? (a/b*100) : 0;
  function set(id, value) { const el=document.getElementById(id); if(el) el.textContent=value; }
  function renderExecutive() {
    if (typeof getDateRange !== "function") return;
    const range=getDateRange(); if(!range) return;
    const start=range.start, end=range.end;
    const inside = date => { const d=new Date(date+'T00:00:00'); return d>=start && d<=end; };
    const activeLeads=leads.filter(x=>inside(x.date));
    const activeDeals=deals.filter(x=>inside(x.date));
    const activePayments=payments.filter(x=>inside(x.date) && x.status==='Received');
    const dealValue=activeDeals.reduce((s,x)=>s+x.value,0);
    const collected=activePayments.reduce((s,x)=>s+x.amount,0);
    const converted=activeLeads.filter(x=>x.status==='Converted').length;
    set('execPipeline',fmtMoney(dealValue)); set('execCollected',fmtMoney(collected));
    set('execConversion',safePct(converted,activeLeads.length).toFixed(1)+'%');
    set('execAverage',fmtMoney(activeDeals.length?dealValue/activeDeals.length:0));
    set('execCollectionFoot',activePayments.length+' received payment record'+(activePayments.length===1?'':'s'));

    const allLeads=leads.filter(x=>inside(x.date));
    const allQuotes=quotations.filter(x=>inside(x.date));
    const accepted=allQuotes.filter(x=>x.status==='Accepted').length;
    const outstanding=activeDeals.reduce((sum,d)=>sum+Math.max(0,d.value-payments.filter(p=>p.dealId===d.id && p.status==='Received').reduce((s,p)=>s+p.amount,0)),0);
    const services={}; activeDeals.forEach(d=>services[d.service]=(services[d.service]||0)+d.value);
    const topService=Object.entries(services).sort((a,b)=>b[1]-a[1])[0];
    const insights=[];
    if(activeLeads.length) insights.push({type:converted/activeLeads.length>=.25?'good':'watch',icon:'↗',title:'Lead conversion',body:`${converted} of ${activeLeads.length} leads converted (${safePct(converted,activeLeads.length).toFixed(1)}%). ${converted/activeLeads.length>=.25?'Conversion is at least 25% in this sample.':'Review lead quality and follow-up to improve conversion.'}`});
    else insights.push({type:'watch',icon:'i',title:'No leads in selected range',body:'Expand the date range to compare lead activity.'});
    if(allQuotes.length) insights.push({type:accepted/allQuotes.length>=.4?'good':'watch',icon:'▤',title:'Quotation acceptance',body:`${accepted} of ${allQuotes.length} quotations were accepted (${safePct(accepted,allQuotes.length).toFixed(1)}%). Follow up on sent quotations to improve the outcome.`});
    if(activeDeals.length) insights.push({type:outstanding>0?'watch':'good',icon:'₹',title:outstanding>0?'Outstanding deal balance':'Collections covered deal value',body:outstanding>0?`${fmtMoney(outstanding)} remains against deals created in this period, based on all recorded received payments.`:'Recorded received payments cover the value of deals in this period.'});
    if(topService) insights.push({type:'good',icon:'★',title:'Leading service by deal value',body:`${topService[0]} leads the selected period with ${fmtMoney(topService[1])} in deal value.`});
    const list=document.getElementById('insightList');
    if(list) list.innerHTML=insights.slice(0,4).map(x=>`<div class="insight-item ${x.type}"><span class="insight-symbol">${x.icon}</span><div><strong>${x.title}</strong><p>${x.body}</p></div></div>`).join('');

    // Simple linear regression on daily received payments in the selected range.
    // It is intentionally labelled as an illustrative estimate, not an ML prediction.
    const keys=[], values=[];
    const cursor=new Date(start); let safety=0;
    while(cursor<=end && safety<120) { const key=[cursor.getFullYear(),String(cursor.getMonth()+1).padStart(2,'0'),String(cursor.getDate()).padStart(2,'0')].join('-'); keys.push(key); values.push(activePayments.filter(p=>p.date===key).reduce((s,p)=>s+p.amount,0)); cursor.setDate(cursor.getDate()+1); safety++; }
    const n=values.length || 1, meanX=(n-1)/2, meanY=values.reduce((s,v)=>s+v,0)/n;
    let numerator=0,denominator=0; values.forEach((v,i)=>{numerator+=(i-meanX)*(v-meanY);denominator+=(i-meanX)**2;});
    const slope=denominator?numerator/denominator:0;
    const projected=Array.from({length:7},(_,i)=>Math.max(0,meanY+slope*(n+i-meanX)));
    const forecastTotal=projected.reduce((s,v)=>s+v,0);
    set('forecastValue',fmtMoney(forecastTotal)); set('forecastAverage',fmtMoney(meanY));
    if(typeof Chart!=='undefined' && document.getElementById('forecastChart')) {
      if(window.executiveForecastChart) window.executiveForecastChart.destroy();
      const labels=Array.from({length:7},(_,i)=>{const d=new Date(end);d.setDate(d.getDate()+i+1);return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});});
      window.executiveForecastChart=new Chart(document.getElementById('forecastChart'),{type:'line',data:{labels,datasets:[{label:'Illustrative forecast',data:projected,borderColor:'#7354d8',backgroundColor:'rgba(115,84,216,.10)',fill:true,tension:.32,pointRadius:3,pointHoverRadius:5,borderDash:[5,4]}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>fmtMoney(ctx.parsed.y)}}},scales:{y:{beginAtZero:true,ticks:{callback:value=>value>=1000?'₹'+(value/1000).toFixed(0)+'k':'₹'+value},grid:{color:'#edf0f6'}},x:{grid:{display:false}}}}});
    }
  }
  window.renderDashboard=function(){ baseRender(); renderExecutive(); };
  document.addEventListener('DOMContentLoaded',renderExecutive);
  // Initial app.js render runs before this enhancement file is evaluated; render the summary once now.
  renderExecutive();
})();
