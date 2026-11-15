import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessLocationFix,
  classifyAccuracyQuality,
  formatAccuracyPtBr,
  formatDistancePtBr,
  haversineDistanceMeters,
} from './geolocation.ts';

const UTINGA_PARK = { lat: -1.4256, lng: -48.4426 };
const BELEM_NAZARE = { lat: -1.4525, lng: -48.4819 };
const SAO_PAULO = { lat: -23.5505, lng: -46.6333 };

test('haversineDistanceMeters computes realistic distance within Belem and across Brazil', () => {
  const localMeters = haversineDistanceMeters(BELEM_NAZARE, UTINGA_PARK);
  assert.ok(localMeters > 4500 && localMeters < 6500, `Expected ~5.3km, got ${localMeters}`);

  const farMeters = haversineDistanceMeters(SAO_PAULO, UTINGA_PARK);
  assert.ok(farMeters > 2_400_000 && farMeters < 2_600_000, `Expected ~2460km, got ${farMeters}`);
});

test('formatDistancePtBr and formatAccuracyPtBr format meters and kilometers in pt-BR', () => {
  assert.equal(formatDistancePtBr(18.4), '18 m');
  assert.equal(formatDistancePtBr(1460), '1,5 km');
  assert.equal(formatDistancePtBr(420_000), '420 km');
  assert.equal(formatAccuracyPtBr(25), '± 25 m');
  assert.equal(formatAccuracyPtBr(12500), '± 12,5 km');
  assert.equal(formatAccuracyPtBr(null), null);
});

test('classifyAccuracyQuality categorizes GPS vs coarse Wi-Fi/IP accuracy', () => {
  assert.equal(classifyAccuracyQuality(18), 'high');
  assert.equal(classifyAccuracyQuality(80), 'high');
  assert.equal(classifyAccuracyQuality(250), 'moderate');
  assert.equal(classifyAccuracyQuality(1200), 'low');
  assert.equal(classifyAccuracyQuality(null), 'unknown');
});

test('assessLocationFix flags IP-level far location or low accuracy as needing attention', () => {
  const goodLocal = assessLocationFix(BELEM_NAZARE, 20, UTINGA_PARK);
  assert.equal(goodLocal.quality, 'high');
  assert.equal(goodLocal.isFarFromPark, false);
  assert.equal(goodLocal.needsAttention, false);

  const coarseIp = assessLocationFix(SAO_PAULO, 25_000, UTINGA_PARK);
  assert.equal(coarseIp.quality, 'low');
  assert.equal(coarseIp.isFarFromPark, true);
  assert.equal(coarseIp.needsAttention, true);
  assert.equal(coarseIp.accuracyLabel, '± 25,0 km');
});
