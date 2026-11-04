// Online rider policy: map-aware order selection + precedence-constrained route...
const INF = 1e12;

function parseMap(data) {
  const ids = Object.keys(data.connections || {});
  const index = new Map();
  ids.forEach((id, i) => index.set(id, i));
  const n = ids.length;
  const d = Array.from({ length: n }, () => new Float64Array(n).fill(INF));
  for (let i = 0; i < n; i++) d[i][i] = 0;
  for (const [from, arr] of Object.entries(data.connections)) {
    const a = index.get(from);
    for (const e of arr || []) {
      const b = index.get(e.to);
      if (a == null || b == null) continue;
      const w = parseFloat(e.distance);
      if (Number.isFinite(w) && w < d[a][b]) d[a][b] = w;
    }
  }
  // Floyd-Warshall: the graph is small (100 nodes) and static.
  for (let k = 0; k < n; k++) {
    const dk = d[k];
    for (let i = 0; i < n; i++) {
      const dik = d[i][k];
      if (dik >= INF) continue;
      const di = d[i];
      for (let j = 0; j < n; j++) {
        const v = dik + dk[j];
        if (v < di[j]) di[j] = v;
      }
    }
  }
  const stations = [];
  for (const label of data.locationsByType?.battery_swap || []) {
    const m = /^(node_\d+)/.exec(label);
    if (m) stations.push(m[1]);
  }
  return { ids, index, d, stations };
}

function getDist(map, a, b) {
  if (a === b) return 0;
  const ia = map.index.get(a), ib = map.index.get(b);
  if (ia == null || ib == null) return INF;
  return map.d[ia][ib];
}

function travelFactor(minute) {
  // 6-7 is free-flowing; 7-9 has edge congestion; the rest is moderate.
  if (minute >= 420 && minute < 540) return 2.35;
  if (minute >= 600 && minute < 750) return 2.2;
  return 2.05;
}

function planRoute(map, pos, orders, now, buffer = 2.0) {
  const n = orders.length;
  if (!n) return { time: now, distance: 0, seq: [], feasible: true };
  const allDone = (1 << n) - 1;
  let startPicked = 0;
  for (let i = 0; i < n; i++) if (orders[i].pickedUp) startPicked |= (1 << i);
  const startKey = `${startPicked}|0|${pos}`;
  const best = new Map([[startKey, { time: now, dist: 0 }]]);
  const parent = new Map();
  const pq = [{ key: startKey, picked: startPicked, done: 0, node: pos, time: now }];
  let finalKey = null;

  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i].time < pq[bi].time) bi = i;
    const cur = pq.splice(bi, 1)[0];
    const b = best.get(cur.key);
    if (!b || cur.time > b.time + 1e-9) continue;
    if (cur.done === allDone) { finalKey = cur.key; break; }

    for (let i = 0; i < n; i++) {
      const o = orders[i];
      const bit = 1 << i;
      let action, target, service, nextPicked = cur.picked, nextDone = cur.done;
      if (!(cur.picked & bit)) {
        action = 'pickup'; target = o.pickup; service = 2;
        nextPicked = cur.picked | bit;
      } else if (!(cur.done & bit)) {
        action = 'deliver'; target = o.delivery; service = 1;
        nextDone = cur.done | bit;
      } else continue;

      const raw = getDist(map, cur.node, target);
      if (!Number.isFinite(raw) || raw >= INF) continue;
      const arrive = cur.time + raw * travelFactor(cur.time);
      const finish = arrive + service;
      if (action === 'pickup') {
        if (finish > (o.deadline ?? INF) - 0.2) continue;
      } else {
        if (finish > (o.deadline ?? INF) - buffer) continue;
      }
      const nextKey = `${nextPicked}|${nextDone}|${target}`;
      const old = best.get(nextKey);
      const nextDist = b.dist + raw;
      if (!old || finish < old.time - 1e-9) {
        best.set(nextKey, { time: finish, dist: nextDist });
        parent.set(nextKey, { prev: cur.key, action, target, orderId: o.id, finish });
        pq.push({ key: nextKey, picked: nextPicked, done: nextDone, node: target, time: finish });
      }
    }
  }
  if (!finalKey) return null;

  const seq = [];
  let k = finalKey;
  while (parent.has(k)) {
    const p = parent.get(k);
    seq.push({ action: p.action, target: p.target, orderId: p.orderId, finish: p.finish });
    k = p.prev;
  }
  seq.reverse();
  const fin = best.get(finalKey);
  return { time: fin.time, distance: fin.dist, seq, feasible: true };
}

function spendable(obs, order, map) {
  // Rough standalone rate including approach, two service stops and delivery.
  const d = getDist(map, obs.position, order.pickup) + order.dist;
  if (!Number.isFinite(d)) return -1;
  return order.fee / (d * travelFactor(obs.minute) + 3);
}

function candidateObject(obs, o) {
  return {
    id: o.id, pickedUp: false, pickup: o.pickup, delivery: o.delivery,
    deadline: obs.minute + o.timeLimit, timeLimit: o.timeLimit,
  };
}

export function next(obs, st) {
  if (!st.ready) {
    st.ready = true;
    st.map = null;
    st.swap = false;
    st.station = null;
    st.pending = null;
    st.lastCall = null;
  }

  // Parse the one-time map response.
  if (!st.map) {
    if (obs.result && obs.result.connections) {
      st.map = parseMap(obs.result);
    } else {
      st.lastCall = 'get_map';
      return { toolName: 'get_map', parameters: {} };
    }
  }

  // Parse a battery-station lookup.
  if (st.pending === 'stations') {
    if (obs.result && Array.isArray(obs.result.stations)) {
      const list = obs.result.stations.slice().sort((a, b) =>
        getDist(st.map, obs.position, a.id) - getDist(st.map, obs.position, b.id));
      st.station = list[0]?.id || null;
    }
    st.pending = null;
  }

  const map = st.map;
  const carried = obs.carried || [];
  const open = obs.openOrders || [];
  const minute = obs.minute;
  const remaining = obs.remainingMinutes ?? (840 - minute);

  // Swap state machine.
  if (st.swap) {
    if (!st.station) {
      st.pending = 'stations';
      st.lastCall = 'search';
      return { toolName: 'search_nearby_battery_stations', parameters: { radius: 60 } };
    }
    if (obs.position === st.station) {
      st.swap = false;
      st.station = null;
      st.lastCall = 'swap';
      return { toolName: 'swap_battery', parameters: {} };
    }
    st.lastCall = 'move';
    return { toolName: 'move_to', parameters: { targetLocationId: st.station } };
  }

  // Never detour for a battery while standing on a pickup/delivery point:
  // these are one- or two-minute actions and keeping the promise matters more.
  const hereDeliver = carried
    .filter(o => o.pickedUp && o.delivery === obs.position)
    .sort((a, b) => (a.deadline ?? 1e9) - (b.deadline ?? 1e9))[0];
  if (hereDeliver) {
    st.lastCall = 'deliver';
    return { toolName: 'deliver_food', parameters: { orderId: hereDeliver.id } };
  }
  const herePickup = carried
    .filter(o => !o.pickedUp && o.pickup === obs.position)
    .sort((a, b) => (a.deadline ?? 1e9) - (b.deadline ?? 1e9))[0];
  if (herePickup) {
    st.lastCall = 'pickup';
    return { toolName: 'pickup_food', parameters: { orderId: herePickup.id } };
  }

  // Decide whether battery is insufficient for the current carried route.
  let route = carried.length ? planRoute(map, obs.position, carried, minute, 1.5) : null;
  const routeDist = route ? route.distance : 0;
  const lowForRoute = carried.length > 0 && obs.batteryRange < routeDist + 10;
  const lowEmpty = carried.length === 0 && obs.batteryRange < 12;
  if (minute < 820 && (lowForRoute || lowEmpty)) {
    st.swap = true;
    st.station = null;
    st.lastCall = 'search';
    return { toolName: 'search_nearby_battery_stations', parameters: { radius: 60 } };
  }

  // Try to add one more order.  Marginal time is measured against the best
  // precedence-feasible route for the orders already on board.
  if (carried.length < 5 && remaining > 12) {
    const base = carried.length ? planRoute(map, obs.position, carried, minute, 1.5) : { time: minute, distance: 0, seq: [] };
    if (base) {
      let best = null;
      for (const o of open) {
        if ((o.weight || 0) > obs.remainingCapacity + 1e-9) continue;
        const cand = candidateObject(obs, o);
        const p = planRoute(map, obs.position, [...carried, cand], minute, 2.0);
        if (!p) continue;
        const extra = Math.max(1, p.time - base.time);
        const rate = o.fee / extra;
        // Empty: compare against a normal standalone trip. Loaded: only take
        // genuinely aligned orders; this protects C3 and deadlines.
        const threshold = carried.length ? 0.52 : 0.28;
        if (rate >= threshold && (!best || rate > best.rate)) best = { o, rate, p };
      }
      if (best) {
        st.lastCall = 'accept';
        return { toolName: 'accept_order', parameters: { orderId: best.o.id } };
      }
    }
  }

  // If no orders are on board and nothing is feasible yet, pre-position toward
  // a promising pickup.  The deadline only starts when we accept, so empty
  // travel can be moved outside the delivery clock.
  if (!carried.length) {
    if (minute >= 834) return { toolName: 'wait', parameters: { minutes: Math.max(1, Math.min(6, 840 - minute)) } };
    let best = null;
    const tf = travelFactor(minute);
    for (const o of open) {
      const d = getDist(map, obs.position, o.pickup);
      if (!Number.isFinite(d) || d >= INF) continue;
      const tt = d * tf;
      if ((o.expiresIn ?? 0) <= tt + 1.2) continue;
      const value = o.fee / (o.dist * tf + 3);
      if (!best || value > best.value) best = { o, value, tt };
    }
    if (best && best.o.pickup !== obs.position) {
      st.lastCall = 'preposition';
      return { toolName: 'move_to', parameters: { targetLocationId: best.o.pickup } };
    }
    return { toolName: 'wait', parameters: { minutes: 5 } };
  }

  if (!route) route = planRoute(map, obs.position, carried, minute, 0);
  if (route && route.seq.length) {
    const a = route.seq[0];
    if (obs.position === a.target) {
      st.lastCall = a.action;
      return {
        toolName: a.action === 'pickup' ? 'pickup_food' : 'deliver_food',
        parameters: { orderId: a.orderId },
      };
    }
    st.lastCall = 'move';
    return { toolName: 'move_to', parameters: { targetLocationId: a.target } };
  }

  // Fallback: deliver/collect the most urgent task directly.
  const picked = carried.filter(o => o.pickedUp);
  if (picked.length) {
    picked.sort((a, b) => (a.deadline ?? 1e9) - (b.deadline ?? 1e9));
    if (obs.position === picked[0].delivery) {
      st.lastCall = 'deliver';
      return { toolName: 'deliver_food', parameters: { orderId: picked[0].id } };
    }
    st.lastCall = 'move';
    return { toolName: 'move_to', parameters: { targetLocationId: picked[0].delivery } };
  }
  const unpicked = carried.slice().sort((a, b) => (a.deadline ?? 1e9) - (b.deadline ?? 1e9));
  if (unpicked.length) {
    if (obs.position === unpicked[0].pickup) {
      st.lastCall = 'pickup';
      return { toolName: 'pickup_food', parameters: { orderId: unpicked[0].id } };
    }
    st.lastCall = 'move';
    return { toolName: 'move_to', parameters: { targetLocationId: unpicked[0].pickup } };
  }
  return { toolName: 'wait', parameters: { minutes: 5 } };
}
