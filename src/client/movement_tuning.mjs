// 行驶速度倍率（v1.5）：不改 src/engine/，在客户端运行时包一层。
//
// 引擎里“速度”只有一个来源：CongestionManager.congestionToSpeed(congestion)（静态方法）。
//   move_to 的实际耗时（MovementCalculator.calculateSpeed）、estimate_time（Pathfinder.estimateTime）
//   都经过它，所以只要把它的返回值乘上倍率，移动、预估和越线预判就同步变快。
// 引擎里唯一绕开它的是 search_nearby_battery_stations 的 estimatedTime（query-tools.js 里写死 30/25/20/15），
//   由 scaleStationEstimates 在返回给模型之前按同一倍率换算。
// 不动的：推行速度 10 km/h（没电惩罚）、取货 2 分钟 / 送货 1 分钟 / 换电 1 分钟、电量 2%/km。
// rider_client 与 verify_replay 共用本模块与同一配置（protocol.json 记录 movement），保证回放一致。

export const DEFAULT_MOVEMENT = { speed_multiplier: 1 };

export function mergeMovement(raw) {
  const m = Number(raw && raw.speed_multiplier);
  const speed = Number.isFinite(m) && m > 0 ? Math.min(5, Math.max(0.25, m)) : DEFAULT_MOVEMENT.speed_multiplier;
  return { speed_multiplier: speed };
}

// 幂等：重复调用不会叠乘（始终基于最初的原始实现）。
export function applySpeedMultiplier(CongestionManager, multiplier) {
  if (!CongestionManager.__srBaseSpeed) CongestionManager.__srBaseSpeed = CongestionManager.congestionToSpeed;
  const base = CongestionManager.__srBaseSpeed;
  CongestionManager.congestionToSpeed = multiplier === 1
    ? base
    : (congestion) => base.call(CongestionManager, congestion) * multiplier;
  return multiplier;
}

// search_nearby_battery_stations 的 estimatedTime 是引擎按 30/25/20/15 写死算的，需要按倍率缩短。
export function scaleStationEstimates(response, multiplier) {
  if (multiplier === 1 || !response || !response.success || !response.data) return response;
  const stations = response.data.stations;
  if (!Array.isArray(stations)) return response;
  for (const s of stations) if (typeof s.estimatedTime === 'number') s.estimatedTime = s.estimatedTime / multiplier;
  return response;
}

// 供 help 的规则文本使用（挂在 sim.rulesInfo 上）。
export function buildRulesInfo(movement, timeLimitCfg) {
  const tl = timeLimitCfg || {};
  return {
    speedMultiplier: movement.speed_multiplier,
    timeLimit: { enabled: !!tl.enabled, scale: tl.scale ?? 1, cutMinutes: tl.cutMinutes ?? 0, minMinutes: tl.minMinutes ?? 12 },
  };
}
