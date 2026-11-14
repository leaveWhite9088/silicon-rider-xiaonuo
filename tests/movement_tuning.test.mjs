import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMovement, applySpeedMultiplier, scaleStationEstimates, buildRulesInfo } from '../src/client/movement_tuning.mjs';

// 与引擎 CongestionManager 同形的替身：静态方法 congestionToSpeed
const makeCM = () => class FakeCM {
  static congestionToSpeed(c) { return c < 0.3 ? 30 : c < 0.5 ? 25 : c < 0.7 ? 20 : 15; }
};

test('mergeMovement defaults to 1 and clamps nonsense', () => {
  assert.equal(mergeMovement(undefined).speed_multiplier, 1);
  assert.equal(mergeMovement({}).speed_multiplier, 1);
  assert.equal(mergeMovement({ speed_multiplier: 'x' }).speed_multiplier, 1);
  assert.equal(mergeMovement({ speed_multiplier: -3 }).speed_multiplier, 1);
  assert.equal(mergeMovement({ speed_multiplier: 2 }).speed_multiplier, 2);
  assert.equal(mergeMovement({ speed_multiplier: 99 }).speed_multiplier, 5);
});

test('applySpeedMultiplier scales every congestion tier', () => {
  const CM = makeCM();
  applySpeedMultiplier(CM, 2);
  assert.deepEqual([0, 0.4, 0.6, 0.9].map(c => CM.congestionToSpeed(c)), [60, 50, 40, 30]);
});

test('applySpeedMultiplier is idempotent and resettable (no compounding)', () => {
  const CM = makeCM();
  applySpeedMultiplier(CM, 2);
  applySpeedMultiplier(CM, 2);
  assert.equal(CM.congestionToSpeed(0), 60);
  applySpeedMultiplier(CM, 1);
  assert.equal(CM.congestionToSpeed(0), 30);
});

test('scaleStationEstimates shortens engine hard-coded estimates and ignores failures', () => {
  const res = { success: true, data: { stations: [{ estimatedTime: 16 }, { estimatedTime: 9 }] } };
  scaleStationEstimates(res, 2);
  assert.deepEqual(res.data.stations.map(s => s.estimatedTime), [8, 4.5]);
  const same = { success: true, data: { stations: [{ estimatedTime: 16 }] } };
  scaleStationEstimates(same, 1);
  assert.equal(same.data.stations[0].estimatedTime, 16);
  assert.deepEqual(scaleStationEstimates({ success: false }, 2), { success: false });
});

test('buildRulesInfo carries speed and time-limit tightening for help text', () => {
  const info = buildRulesInfo({ speed_multiplier: 2 }, { enabled: true, scale: 0.5, cutMinutes: 0, minMinutes: 12 });
  assert.equal(info.speedMultiplier, 2);
  assert.deepEqual(info.timeLimit, { enabled: true, scale: 0.5, cutMinutes: 0, minMinutes: 12 });
  assert.equal(buildRulesInfo({ speed_multiplier: 1 }, undefined).timeLimit.enabled, false);
});
