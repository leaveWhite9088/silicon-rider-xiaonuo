import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const SESSION = process.argv[2];
if (!SESSION) { console.error('usage: node work_driver.mjs <session> [--dry] [--max N]'); process.exit(1); }
const DRY = process.argv.includes('--dry');
const MAXN = (() => { const i=process.argv.indexOf('--max'); return i>0 ? Number(process.argv[i+1]) : 500; })();

const sess = JSON.parse(fs.readFileSync(path.join('.sessions', SESSION + '.json'), 'utf8'));
const mapPath = `work_map_${SESSION.match(/s\d$/)?.[0] || 's1'}.json`;
const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8').replace(/^\uFEFF/, ''));
const nodes = Object.keys(rawMap.connections);
const adj = new Map(nodes.map(n => [n, []]));
for (const [a, es] of Object.entries(rawMap.connections)) {
  for (const e of es) {
    const w = parseFloat(String(e.distance).replace('km',''));
    adj.get(a).push([e.to, w]);
  }
}
const stations = new Set();
for (const [typ, arr] of Object.entries(rawMap.locationsByType)) {
  if (typ === 'battery_swap') for (const s of arr) stations.add(String(s).split('(')[0]);
}
const distAll = new Map();
const pathAll = new Map();
function dijkstra(src) {
  if (distAll.has(src)) return distAll.get(src);
  const dist = new Map([[src, 0]]);
  const prev = new Map();
  const pq = [[0, src]];
  while (pq.length) {
    pq.sort((a,b)=>a[0]-b[0]);
    const [du,u] = pq.shift();
    if (du !== dist.get(u)) continue;
    for (const [v,w] of (adj.get(u)||[])) {
      const nd = du + w;
      if (nd < (dist.get(v) ?? 1e9) - 1e-9) {
        dist.set(v, nd); prev.set(v, u); pq.push([nd,v]);
      }
    }
  }
  distAll.set(src, dist); pathAll.set(src, prev); return dist;
}
function shortest(a,b) { return dijkstra(a).get(b) ?? 1e9; }
function nodePath(a,b) {
  const d = dijkstra(a); if (!d.has(b)) return [];
  const prev = pathAll.get(a); const out=[b]; let x=b;
  while (x!==a) { x=prev.get(x); if (!x) return []; out.push(x); }
  return out.reverse();
}

const state = { factor: 2.0, factorAt: 360, catalog: new Map(), lastAction: null, idleWaits: 0, lastDecision: null, swapTarget: null };
function factorNow(minute) {
  // Use the latest measured moving speed. Keep a little extra margin across the 07:00 boundary
  // until at least one post-07:00 move has actually been measured.
  let f = state.factor;
  if (minute >= 420 && state.factorAt < 420) f = Math.max(f, 2.2);
  return Math.min(4.5, Math.max(1.2, f + 0.07));
}
function travelTime(dist, minute) { return Math.max(1, Math.ceil(dist * factorNow(minute) - 1e-9)); }

function fmtTime(m) { const h=Math.floor(m/60), mm=Math.floor(m%60); return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }

function mkOrders(obs, extras=[]) {
  const all = [];
  for (const o of (obs.carried||[])) {
    const info = state.catalog.get(o.id) || {};
    all.push({
      id:o.id, pickup:o.pickup||o.pickupLocation, delivery:o.delivery||o.deliveryLocation,
      pickedUp:!!o.pickedUp, deadline:Number(o.deadline), fee:Number(info.fee ?? info.deliveryFee ?? 0),
      weight:Number(info.weight ?? 0), open:false
    });
  }
  for (const o of extras) {
    all.push({ id:o.id, pickup:o.pickup, delivery:o.delivery, pickedUp:false,
      deadline:Number(o.deadline), fee:Number(o.fee), weight:Number(o.weight||0), open:true });
  }
  return all;
}

// Exact small-state deadline-constrained route search. Returns earliest feasible route.
// Among equal completion times, prefer shorter travel distance.
function planRoute(pos, now, orders, opts={}) {
  const n = orders.length;
  if (!n) return {completion:now, distance:0, actions:[], deliveries:{}};
  const safety = Number(opts.safety ?? 0);
  const end = Number(opts.end ?? 840);
  const pow = [1]; for (let i=1;i<=n;i++) pow[i]=pow[i-1]*3;
  let startMask = 0;
  for (let i=0;i<n;i++) if (orders[i].pickedUp) startMask += pow[i]; // status 1
  const fullMask = pow[n]-1; // all status 2
  const key = (p,m)=>p+'|'+m;
  const best = new Map(), bestD = new Map(), prev = new Map();
  const startK = key(pos,startMask); best.set(startK, now); bestD.set(startK, 0);
  let pq = [{p:pos,m:startMask,t:now,d:0}];
  let goal = null;
  while (pq.length) {
    pq.sort((a,b)=> a.t-b.t || a.d-b.d);
    const cur = pq.shift();
    const k = key(cur.p,cur.m);
    if (cur.t > (best.get(k) ?? 1e9) + 1e-9 || cur.d > (bestD.get(k) ?? 1e18) + 1e-9) continue;
    if (cur.m === fullMask) { goal = cur; break; }
    const add = (np,nm,nt,nd,act) => {
      if (nt > end + 1e-9) return;
      const nk = key(np,nm);
      if (nt < (best.get(nk) ?? 1e9) - 1e-9 || (Math.abs(nt-(best.get(nk)??1e9))<1e-9 && nd < (bestD.get(nk)??1e18)-1e-9)) {
        best.set(nk,nt); bestD.set(nk,nd); prev.set(nk,{k,act}); pq.push({p:np,m:nm,t:nt,d:nd});
      }
    };
    // Service actions available at the current node.
    for (let i=0;i<n;i++) {
      const st = Math.floor(cur.m / pow[i]) % 3;
      if (st===0 && orders[i].pickup===cur.p) add(cur.p, cur.m+pow[i], cur.t+2, cur.d, {type:'pickup_food',orderId:orders[i].id,at:cur.p});
      if (st===1 && orders[i].delivery===cur.p) {
        const nt = cur.t+1;
        if (nt <= orders[i].deadline - safety + 1e-9) add(cur.p, cur.m+pow[i], nt, cur.d, {type:'deliver_food',orderId:orders[i].id,at:cur.p});
      }
    }
    // Travel to any remaining pickup/delivery target.
    const seenTargets = new Set();
    for (let i=0;i<n;i++) {
      const st = Math.floor(cur.m / pow[i]) % 3;
      let target=null, typ=null;
      if (st===0) { target=orders[i].pickup; typ='pickup'; }
      else if (st===1) { target=orders[i].delivery; typ='delivery'; }
      if (!target || target===cur.p) continue;
      if (seenTargets.has(target)) continue; seenTargets.add(target);
      const dd = shortest(cur.p,target);
      if (dd>=1e8) continue;
      const nt = cur.t + travelTime(dd,cur.t);
      add(target, cur.m, nt, cur.d+dd, {type:'move_to',targetLocationId:target,at:cur.p,dist:dd});
    }
  }
  if (!goal) return null;
  const actions=[]; let k = key(goal.p,goal.m);
  while (k !== startK) { const pr=prev.get(k); if(!pr) break; actions.push(pr.act); k=pr.k; }
  actions.reverse();
  return {completion:goal.t, distance:goal.d, actions};
}

function currentCarried(obs) { return mkOrders(obs, []); }
function deliveryDeadlineForCandidate(obs,o) { return obs.minute + Number(o.timeLimit); }
function admittedOrders(obs, extra) { return mkOrders(obs, extra); }

function capAfter(obs, extra=[]) {
  const n=(obs.carried||[]).length+extra.length;
  const w=(obs.weight||0)+extra.reduce((z,o)=>z+Number(o.weight||0),0);
  return {n,w,ok:n<=5 && w<=10.000001};
}

function candidateRate(obs, basePlan, cand, extraExisting=[]) {
  if (!capAfter(obs,[cand,...extraExisting]).ok) return null;
  const c = {id:cand.id,pickup:cand.pickup,delivery:cand.delivery,deadline:deliveryDeadlineForCandidate(obs,cand),fee:cand.fee,weight:cand.weight};
  const orders = admittedOrders(obs, [c,...extraExisting]);
  const p = planRoute(obs.position, obs.minute, orders, {safety:2.0, end:830});
  if (!p) return null;
  const br=Number(obs.batteryRange ?? obs.battery/2);
  if (p.distance + 4 > br + 1e-9) return null;
  const base = basePlan ? basePlan.completion : obs.minute;
  const marginal = Math.max(1, p.completion-base);
  const total = Math.max(1, p.completion-obs.minute);
  return {plan:p, marginal, total, rate:Number(cand.fee)/marginal, totalRate:Number(cand.fee)/total, fee:Number(cand.fee), cand:c};
}

function bestAdmission(obs) {
  const carried = currentCarried(obs);
  const basePlan = planRoute(obs.position, obs.minute, carried, {safety:0, end:839});
  if (carried.length && !basePlan) return {action:null, reason:'current-route-infeasible'};
  const minute = obs.minute;
  let threshold = minute>=800 ? 0.14 : minute>=760 ? 0.18 : minute>=700 ? 0.22 : 0.29;
  if (state.idleWaits >= 1) threshold = Math.max(0.12, threshold-0.06);
  const ranked=[];
  for (const o of (obs.openOrders||[])) {
    if (!o || o.expiresIn <= 1) continue;
    const trial = candidateRate(obs, basePlan, o);
    if (!trial) continue;
    const atPickup = o.pickup===obs.position;
    const cluster = (obs.openOrders||[]).filter(x=>x.pickup===o.pickup && x.expiresIn>1).length;
    let score = trial.rate;
    if (atPickup) score += 0.20;
    if (cluster>=2) score += 0.03*Math.min(3,cluster-1);
    ranked.push({o,trial,score,atPickup,cluster});
  }
  ranked.sort((a,b)=>b.score-a.score || b.trial.fee-a.trial.fee);
  const pick = ranked.find(x=> x.trial.rate>=threshold && (x.atPickup || x.trial.totalRate>=threshold-0.02));
  if (!pick) return {action:null, ranked, threshold, basePlan, carried};
  return {action:{toolName:'accept_order',parameters:{orderId:pick.o.id}}, pick,
    debug:`accept ${pick.o.id} fee=${pick.o.fee.toFixed(2)} rate=${pick.trial.rate.toFixed(2)} total=${pick.trial.total.toFixed(0)} deadline=${pick.trial.cand.deadline.toFixed(0)} thr=${threshold.toFixed(2)}`,
    basePlan,carried};
}

function choosePreposition(obs) {
  const minute=obs.minute;
  let threshold = minute>=780 ? 0.14 : minute>=720 ? 0.20 : 0.27;
  const groups = new Map();
  for (const o of (obs.openOrders||[])) {
    if (!o || o.expiresIn<=1) continue;
    const d=shortest(obs.position,o.pickup);
    if (d>=1e8) continue;
    const eta=travelTime(d,minute);
    if (eta+2 > o.expiresIn-0.5) continue;
    const br=Number(obs.batteryRange ?? obs.battery/2);
    if (d + 5 > br + 1e-9) continue;
    if (!groups.has(o.pickup)) groups.set(o.pickup,[]); groups.get(o.pickup).push({o,d,eta});
  }
  let best=null;
  for (const [pickup,arr] of groups) {
    const eta=arr[0].eta;
    const arrive=minute+eta;
    // Orders still likely present when we arrive.
    const avail=arr.map(x=>x.o).filter(o=>o.expiresIn > eta+1.5);
    if (!avail.length) continue;
    // Build a conservative virtual bundle, greedily by fee, and test the post-arrival trip.
    avail.sort((a,b)=>b.fee-a.fee);
    let chosen=[], chosenPlan=null;
    for (const o of avail) {
      const c={id:o.id,pickup:o.pickup,delivery:o.delivery,deadline:arrive+Number(o.timeLimit),fee:o.fee,weight:o.weight};
      const trialOrders=chosen.concat([c]);
      const totalW=trialOrders.reduce((z,x)=>z+Number(x.weight||0),0);
      if (trialOrders.length>5 || totalW>10.0001) continue;
      const pp=planRoute(pickup,arrive,trialOrders,{safety:1.0,end:839});
      if (pp) { chosen=trialOrders; chosenPlan=pp; }
    }
    if (!chosenPlan) continue;
    const fee=chosen.reduce((z,x)=>z+x.fee,0);
    const total=Math.max(2,chosenPlan.completion-minute);
    const rate=fee/total;
    if (rate < threshold) continue;
    const cand={pickup,eta,arrive,fee,count:chosen.length,completion:chosenPlan.completion,rate,orders:chosen.map(x=>x.id)};
    if (!best || rate>best.rate || (Math.abs(rate-best.rate)<1e-6 && fee>best.fee)) best=cand;
  }
  if (!best) return null;
  return {action:{toolName:'move_to',parameters:{targetLocationId:best.pickup}}, best,
    debug:`preposition ${best.pickup} eta=${best.eta} potential=${best.fee.toFixed(2)}/${best.count} rate=${best.rate.toFixed(2)} finish=${best.completion.toFixed(0)}`};
}

function nearestStation(pos) {
  let best=null;
  for (const s of stations) { const d=shortest(pos,s); if (!best || d<best.d) best={station:s,d}; }
  return best;
}

async function call(pathname, body) {
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:sess.port,path:pathname,method:body?'POST':'GET'},res=>{
      let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){reject(new Error(d));}});
    }); req.on('error',reject); if(body)req.write(JSON.stringify(body)); req.end();
  });
}


const logPath=`work_play_${SESSION}.jsonl`;
let n=0;
while (n++ < MAXN) {
  const st=await call('/state');
  const obs=st.observed;
  if (!obs) { await new Promise(r=>setTimeout(r,200)); continue; }
  if (st.ended || obs.minute>=840) { console.log(`[end] minute=${obs.minute} profit=${obs.profit}`); break; }
  // Remember open order metadata.
  for (const o of (obs.openOrders||[])) state.catalog.set(o.id,o);
  const minute=obs.minute;
  const carried=currentCarried(obs);
  const basePlan=planRoute(obs.position, minute, carried, {safety:0,end:839});
  const routeDist=basePlan?basePlan.distance:0;
  let decision=null, why='';

  // Service first when it is exactly under our feet; avoids needless battery detours.
  if (basePlan && basePlan.actions.length) {
    const a0=basePlan.actions[0];
    if ((a0.type==='deliver_food'||a0.type==='pickup_food') && a0.at===obs.position) {
      decision={toolName:a0.type,parameters:{orderId:a0.orderId}}; why='service-at-position';
    }
  }
  // Even when the deadline-constrained plan is already impossible, never skip a free service
  // that is literally under our feet.
  if (!decision && carried.length) {
    const dh=carried.find(o=>o.pickedUp && o.delivery===obs.position);
    const ph=carried.find(o=>!o.pickedUp && o.pickup===obs.position);
    if (dh) { decision={toolName:'deliver_food',parameters:{orderId:dh.id}}; why='fallback-service-here'; }
    else if (ph) { decision={toolName:'pickup_food',parameters:{orderId:ph.id}}; why='fallback-service-here'; }
  }

  // Battery management.
  if (!decision) {
    const range=Number(obs.batteryRange ?? obs.battery/2);
    const atIntendedSwap = state.swapTarget && obs.position===state.swapTarget;
    const needSwap = atIntendedSwap || range < 9 || (carried.length>0 && range < routeDist + 5.0) || (carried.length===0 && range < 7);
    if (needSwap) {
      if (stations.has(obs.position) && obs.battery<99.5) { decision={toolName:'swap_battery',parameters:{}}; state.swapTarget=null; why='swap-here'; }
      else {
        const ns=nearestStation(obs.position);
        if (ns && ns.d < range + 0.5) { decision={toolName:'move_to',parameters:{targetLocationId:ns.station}}; state.swapTarget=ns.station; why=`swap-trip ${ns.station} d=${ns.d.toFixed(1)} range=${range.toFixed(1)}`; }
      }
    }
  }

  // Admission of currently feasible orders.
  if (!decision) {
    const adm=bestAdmission(obs);
    if (adm.action) { decision=adm.action; why=adm.debug; }
    else if (carried.length===0) {
      const prep=choosePreposition(obs);
      if (prep) { decision=prep.action; why=prep.debug; }
    }
  }

  // Execute current carried route.
  if (!decision && carried.length) {
    if (!basePlan) {
      // Fallback routing for an already-late chain: prioritise recoverable fee per remaining km.
      const scored=[...carried].map(o=>{
        const target=o.pickedUp?o.delivery:o.pickup;
        const remain=shortest(obs.position,target)+ (o.pickedUp?0:shortest(o.pickup,o.delivery));
        return {o,target,score:(Number(o.fee)||0)/(remain+1)};
      }).sort((a,b)=>b.score-a.score);
      const next=scored[0];
      decision={toolName:'move_to',parameters:{targetLocationId:next.target}};
      why='fallback-route';
    } else {
      const a0=basePlan.actions[0];
      if (!a0) { decision={toolName:'wait',parameters:{minutes:1}}; why='empty-plan'; }
      else if (a0.type==='move_to') { decision={toolName:a0.type,parameters:{targetLocationId:a0.targetLocationId}}; why=`route ${a0.targetLocationId} finish=${basePlan.completion.toFixed(0)}`; }
      else { decision={toolName:a0.type,parameters:{orderId:a0.orderId}}; why='route-service'; }
    }
  }

  // Wait for the next supply batch when there is no worthwhile trip.
  if (!decision) {
    const remain=840-minute;
    if (remain<=0) break;
    const w=Math.max(1,Math.min(5,Math.floor(remain)));
    decision={toolName:'wait',parameters:{minutes:w}}; why='wait-next-batch';
    state.idleWaits++;
  } else if (decision.toolName!=='wait') {
    state.idleWaits=0;
  }

  const log={t:minute,pos:obs.position,battery:obs.battery,profit:obs.profit,carried:carried.map(x=>`${x.id}:${x.pickedUp?'P':'U'}`),open:(obs.openOrders||[]).length,action:decision,why};
  fs.appendFileSync(logPath,JSON.stringify(log)+'\n');
  console.log(`[${fmtTime(minute)}] ¥${Number(obs.profit).toFixed(2)} B${Number(obs.battery).toFixed(0)} ${obs.position} C${carried.length} ${decision.toolName} ${decision.parameters?.orderId||decision.parameters?.targetLocationId||decision.parameters?.minutes||''} | ${why}`);
  if (DRY) break;
  const resp=await call('/act',decision);
  state.lastAction=decision;
  if (resp.result && decision.toolName==='move_to' && resp.result.success && resp.result.distance>0 && resp.result.timeCost>0) {
    const f=Number(resp.result.timeCost)/Number(resp.result.distance);
    if (Number.isFinite(f) && f>0) { state.factor=Math.max(1.2,Math.min(4.5,f)); state.factorAt=Number(resp.observed?.minute ?? minute); }
  }
  if (resp.result && decision.toolName==='accept_order' && resp.result.order) {
    const o=resp.result.order; state.catalog.set(o.id,{...o,fee:o.deliveryFee ?? o.fee,weight:o.weight});
  }
  if (!resp.ok && !resp.ended) console.error('action failed:',JSON.stringify(resp).slice(0,500));
  if (resp.ended) { console.log(`[ended] minute=${resp.observed?.minute} profit=${resp.observed?.profit}`); break; }
  if (DRY) break;
}
console.log(JSON.stringify({session:SESSION,actions:n,finalFactor:state.factor,log:logPath}));
