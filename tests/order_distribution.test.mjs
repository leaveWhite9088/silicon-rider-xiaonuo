import test from 'node:test';
import assert from 'node:assert/strict';
import { createDistribution, mergeDistribution, engineTimeLimit } from '../src/client/order_distribution.mjs';

const nodes = new Map([
  ['r1', { id: 'r1', type: 'restaurant' }],
  ['s1', { id: 's1', type: 'supermarket' }],
  ['p1', { id: 'p1', type: 'pharmacy' }],
  ['d1', { id: 'd1', type: 'residential' }],
  ['d2', { id: 'd2', type: 'office' }],
]);
const make = (config = {}) => createDistribution({ nodes, seed: 12345, config });

test('timeLimit defaults to off and does not touch orders', () => {
  assert.equal(mergeDistribution({}).timeLimit.enabled, false);
  const d = make({ enabled: false });
  const order = { distance: 10, timeLimit: engineTimeLimit(10) };
  assert.equal(d.applyTimeLimit(order), false);
  assert.equal(order.timeLimit, engineTimeLimit(10));
});

test('uniform cut applies to every distance', () => {
  const d = make({ enabled: false, timeLimit: { enabled: true, cutMinutes: 3 } });
  for (const distance of [2, 7, 14, 20]) {
    const order = { distance, timeLimit: engineTimeLimit(distance) };
    assert.equal(d.applyTimeLimit(order), true);
    assert.equal(order.timeLimit, Math.max(12, engineTimeLimit(distance) - 3));
  }
});

test('scale and floor are honored', () => {
  const d = make({ enabled: false, timeLimit: { enabled: true, scale: 0.5, minMinutes: 12 } });
  assert.equal(d.adjustedTimeLimit(20), engineTimeLimit(20) * 0.5);
  assert.equal(d.adjustedTimeLimit(2), 12);
});

test('applyToExisting covers the initial pool', () => {
  const d = make({ enabled: false, timeLimit: { enabled: true, cutMinutes: 2 } });
  const orders = [
    { distance: 10, timeLimit: engineTimeLimit(10) },
    { distance: 20, timeLimit: engineTimeLimit(20) },
  ];
  const n = d.applyToExisting({ getAvailableOrders: () => orders });
  assert.equal(n, 2);
  assert.equal(orders[0].timeLimit, engineTimeLimit(10) - 2);
  assert.equal(orders[1].timeLimit, engineTimeLimit(20) - 2);
});

test('spawnBatch applies timeLimit even when spatial distribution is off', () => {
  const d = make({ enabled: false, timeLimit: { enabled: true, cutMinutes: 3 } });
  const orders = [];
  let id = 0;
  const sim = {
    getAvailableOrders: () => orders,
    advanceSimulation: () => orders.push({ id: 'o' + (++id), distance: 10, timeLimit: engineTimeLimit(10) }),
  };
  assert.equal(d.spawnBatch(sim, 360), 1);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].timeLimit, engineTimeLimit(10) - 3);
});

test('scale cannot loosen the engine time limit', () => {
  const d = make({ enabled: false, timeLimit: { enabled: true, scale: 2 } });
  assert.equal(d.adjustedTimeLimit(10), engineTimeLimit(10));
});
