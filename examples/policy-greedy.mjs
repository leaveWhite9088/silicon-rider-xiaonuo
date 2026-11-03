// 示例策略（executor 可直接改用）：贪心选单 + 到店取货 + 直送 + 低电量换电。
// 只用"观察 + 工具返回"，不需要地图知识。
//
// 用法：
//   node tools/harness.mjs --model Demo-s1 --seed-index 1 --policy examples/policy-greedy.mjs
//
// 返回值：{ toolName, parameters } 表示执行；null 表示收工。
export function next(obs, st) {
  const carried = obs.carried || [];
  const picked = carried.filter(o => o.pickedUp);
  const unpicked = carried.filter(o => !o.pickedUp);
  const at = obs.position;
  const res = obs.result || null;

  // 0) 电量低于 30% 且没在换电路上：先问最近换电站，再骑过去换
  if (obs.battery < 30 && st.mode !== 'swap') {
    st.mode = 'swap';
    st.station = null;
    return { toolName: 'search_nearby_battery_stations', parameters: { radius: 50 } };
  }
  if (st.mode === 'swap') {
    if (res && Array.isArray(res.stations)) st.station = res.stations[0]?.id || null;
    if (st.station === at) { st.mode = null; return { toolName: 'swap_battery', parameters: {} }; }
    if (st.station) return { toolName: 'move_to', parameters: { targetLocationId: st.station } };
    st.mode = null;                                   // 找不到站，继续跑单
  }

  // 1) 已取货且就在送餐点 → 送
  const d = picked.find(o => o.delivery === at);
  if (d) return { toolName: 'deliver_food', parameters: { orderId: d.id } };

  // 2) 未取货且就在取餐点 → 取
  const p = unpicked.find(o => o.pickup === at);
  if (p) return { toolName: 'pickup_food', parameters: { orderId: p.id } };

  // 3) 手上有单 → 先去最近的送/取点（先送已取的）
  const target = picked[0]?.delivery || unpicked[0]?.pickup;
  if (target && target !== at) return { toolName: 'move_to', parameters: { targetLocationId: target } };

  // 4) 手上没单 → 挑一张"单位时间收入"最高、且还没过期的
  if (carried.length < 3) {
    const best = (obs.openOrders || [])
      .filter(o => (o.expiresIn ?? 99) > 4)
      .sort((x, y) => (y.fee / (2 * y.dist + 3)) - (x.fee / (2 * x.dist + 3)))[0];
    if (best) return { toolName: 'accept_order', parameters: { orderId: best.id } };
  }

  // 5) 什么都没得做 → 等 5 分钟看有没有新单
  return { toolName: 'wait', parameters: { minutes: 5 } };
}
