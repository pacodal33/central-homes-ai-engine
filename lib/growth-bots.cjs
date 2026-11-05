/* Shared by the offline dashboard and Node runner. No external calls or CRM writes. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GrowthBots=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DAY=86400000;
  const money=n=>Math.round((n+Number.EPSILON)*100)/100;
  function number(v,label,{min=0,max=Infinity}={}){
    if(v===null||v===undefined||String(v).trim()===''||typeof v==='boolean')throw Error(label+' is required');
    const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+' must be between '+min+' and '+max);return n;
  }
  function date(v,label){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error(label+' must be YYYY-MM-DD');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)throw Error(label+' is invalid');return +d;}
  function array(v,label){if(!Array.isArray(v))throw Error(label+' must be an array');return v;}
  function text(v,label){if(typeof v!=='string'||!v.trim())throw Error(label+' is required');return v.trim();}
  function parseCSV(input){
    const rows=[];let row=[],cell='',quoted=false;
    input=input.replace(/^\uFEFF/,'');
    for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++;}else if(quoted)quoted=false;else if(cell==='')quoted=true;else throw Error('Unexpected quote in CSV');}
      else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
    if(quoted)throw Error('Unclosed CSV quote');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
    if(!rows.length)return [];const headers=rows.shift().map(x=>x.trim());if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw Error('CSV headers must be unique and nonempty');
    return rows.map((r,i)=>{if(r.length!==headers.length)throw Error('CSV row '+(i+2)+' has the wrong number of columns');return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
  }
  function recovery(jobs,asOf){
    const now=date(asOf,'asOf'),seen=new Set(),queue=[],issues=[];let suppressed=0;
    array(jobs,'jobs').forEach((j,i)=>{try{
      const id=text(j.id,'job id');if(seen.has(id))throw Error('duplicate job id '+id);seen.add(id);
      const status=String(j.status||'').trim().toLowerCase();
      if(j.doNotContact===true||/^(true|yes|1)$/i.test(String(j.doNotContact))){suppressed++;return;}
      if(!['estimate_sent','follow_up','on_hold'].includes(status))return;
      const estimateDate=date(j.estimateDate,'estimateDate');if(estimateDate>now)throw Error('estimateDate is in the future');
      const age=Math.floor((now-estimateDate)/DAY);if(age<7||age>730)return;
      if(j.lastContactDate){const last=date(j.lastContactDate,'lastContactDate');if(last>now)throw Error('lastContactDate is in the future');if((now-last)/DAY<7)return;}
      if(!j.email&&!j.phone){issues.push({id,error:'No email or phone; contact details needed'});return;}
      const value=number(j.estimateAmount,'estimateAmount');
      const staleDays=j.lastContactDate?Math.floor((now-date(j.lastContactDate,'lastContactDate'))/DAY):age;
      const priority=(age<=90?30:age<=180?20:10)+Math.min(30,Math.floor(staleDays/7)*3)+Math.min(20,Math.floor(value/5000)*5);
      const name=String(j.customerName||'there').trim();
      queue.push({id,customerName:name,owner:j.owner||'Unassigned',email:j.email||'',phone:j.phone||'',estimateAmount:value,estimateAgeDays:age,daysSinceContact:staleDays,priority,reason:j.lostReason||'No reason recorded',source:j.source||'Unknown',draft:'Hi '+name+', this is Central Homes Roofing & Solar. We previously provided a roof estimate. Are you still considering the project, or have your plans changed? We can review the scope, current pricing, and timing with you. Reply STOP if you prefer no further follow-up.',requiresReview:true});
    }catch(e){issues.push({row:i+1,id:j.id||null,error:e.message});}});
    return {queue:queue.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)),suppressed,issues,notice:'Drafts only. Verify current status, contact preferences, pricing and recipient before outreach. Quote values are opportunities, not forecast revenue.'};
  }
  function marketing(rows){
    const groups=new Map(),issues=[],seen=new Set();
    array(rows,'marketing').forEach((r,i)=>{try{
      const source=text(r.source,'source'),period=text(r.period,'period'),type=String(r.jobType||'blended').toLowerCase();
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('period must be YYYY-MM');
      if(!['reroof','repair','blended'].includes(type))throw Error('jobType must be reroof, repair or blended');
      const key=JSON.stringify([period,source]);if(seen.has(key))throw Error('Use one row per period/source; aggregate job types first to avoid double counting');seen.add(key);
      const spend=number(r.spend,'spend'),sold=number(r.soldJobs,'soldJobs'),leads=number(r.leads,'leads'),revenue=number(r.revenue,'revenue');
      if(!Number.isInteger(sold)||!Number.isInteger(leads))throw Error('leads and soldJobs must be whole counts');
      const costsKnown=r.directCosts!==undefined&&r.directCosts!==''&&r.commissions!==undefined&&r.commissions!=='';
      const contribution=costsKnown?money(revenue-number(r.directCosts,'directCosts')-number(r.commissions,'commissions')-spend):null;
      groups.set(key,{period,source,jobType:type,spend,soldJobs:sold,leads,revenue,costPerLead:leads?money(spend/leads):null,marketingCAC:sold?money(spend/sold):null,contributionAfterMarketing:contribution,flag:contribution===null?'Costs missing: profitability unknown':contribution<0?'Negative contribution: review campaign':'Positive contribution before overhead',basis:r.basis||'Not specified',note:type==='blended'?'Blended acquisition cost; cannot infer reroof or repair CAC.':''});
    }catch(e){issues.push({row:i+1,error:e.message});}});
    return {channels:[...groups.values()],issues,notice:'Spend excludes commissions. Profit calculations subtract commissions separately. Use matching lead cohorts and update late sales; calendar-month sales are not cohort CAC. No automatic budget changes.'};
  }
  function margins(jobs,target=0.31){
    target=number(target,'targetContributionRate',{max:1});const flags=[],issues=[];
    array(jobs,'jobs').forEach((j,i)=>{try{
      const id=text(j.id,'job id');if(j.estimateAmount===undefined||j.estimateAmount==='')return;
      const revenue=number(j.estimateAmount,'estimateAmount');if(!revenue)return;
      if([j.directCosts,j.commissions,j.marketingCost].some(v=>v===undefined||v===null||v==='')){issues.push({id,error:'Missing directCosts, commissions or marketingCost; margin not calculated'});return;}
      const contribution=money(revenue-number(j.directCosts,'directCosts')-number(j.commissions,'commissions')-number(j.marketingCost,'marketingCost'));
      const rate=contribution/revenue;
      if(rate<target)flags.push({id,owner:j.owner||'Unassigned',revenue,contribution,contributionRate:rate,gapToTarget:money(revenue*target-contribution),action:'Review scope, costs, commission and discount before approval. Do not change a signed contract automatically.'});
    }catch(e){issues.push({row:i+1,error:e.message});}});
    return {targetContributionRate:target,flags:flags.sort((a,b)=>b.gapToTarget-a.gapToTarget),issues,notice:'Contribution here is after direct costs, commission and assigned marketing. Do not compare it to a gross margin that excludes those costs. Cost inputs must not overlap.'};
  }
  function overhead(settings,savings,asOf){
    const currentRevenue=number(settings.currentRevenue,'currentRevenue'),currentNetRate=number(settings.currentNetRate,'currentNetRate',{min:-1,max:1}),variableCostRate=number(settings.variableCostRate,'variableCostRate',{max:0.999999}),projectedRevenue=number(settings.projectedRevenue,'projectedRevenue'),targetNetRate=number(settings.targetNetRate,'targetNetRate',{max:1});
    const baselineOverhead=money(currentRevenue*(1-variableCostRate-currentNetRate));if(baselineOverhead<0)throw Error('Rates imply negative overhead; reconcile baseline');
    const now=date(asOf,'asOf'),year=new Date(now).getUTCFullYear(),start=Date.UTC(year,0,1),end=Date.UTC(year+1,0,1);let planned=0,implemented=0,inYear=0;const issues=[],seen=new Set();
    array(savings,'savings').forEach((s,i)=>{try{const id=text(s.id,'saving id');if(seen.has(id))throw Error('Duplicate saving id '+id);seen.add(id);const amount=number(s.annualAmount,'annualAmount'),effective=date(s.effectiveDate,'effectiveDate');if(!['planned','implemented'].includes(s.status))throw Error('Savings status must be planned or implemented');if(s.status==='implemented'&&effective>now)throw Error('Implemented saving cannot have a future effectiveDate');planned+=amount;if(s.status==='implemented'){implemented+=amount;inYear+=amount*Math.max(0,(end-Math.max(start,effective))/(end-start));}}catch(e){issues.push({row:i+1,error:e.message});}});
    const projectedOverhead=money(baselineOverhead-planned),contribution=money(projectedRevenue*(1-variableCostRate)),profit=money(contribution-projectedOverhead),remainingForTarget=money(Math.max(0,projectedRevenue*targetNetRate-profit));
    return {baselineOverhead,plannedAnnualSavings:money(planned),implementedAnnualizedSavings:money(implemented),implementedCalendarYearSavings:money(inYear),projectedOverhead,projectedRevenue,projectedPretaxProfit:profit,projectedNetRate:projectedRevenue?profit/projectedRevenue:null,breakEvenRevenue:money(Math.max(0,projectedOverhead)/(1-variableCostRate)),additionalSavingsForTarget:remainingForTarget,monthlyGapToTarget:money(remainingForTarget/12),issues,notice:'Projection, not accounting actuals. Planned savings are already included once. Implemented means user-reported; year savings are prorated, not bank-verified. Variable cost must include every expense assumed to decline with sales.'};
  }
  function run(input){
    const asOf=text(input.asOf,'asOf');date(asOf,'asOf');
    return {asOf,mode:'export_analysis_draft_only',jobnimbus:'not_connected',recovery:recovery(input.jobs||[],asOf),marketing:marketing(input.marketing||[]),margins:margins(input.jobs||[],input.settings.targetContributionRate??0.31),overhead:overhead(input.settings,input.savings||[],asOf)};
  }
  return {run,recovery,marketing,margins,overhead,parseCSV};
});
