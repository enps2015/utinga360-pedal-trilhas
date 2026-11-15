import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeEncodedPolyline,
  formatRouteDistance,
  formatRouteDuration,
} from './polyline.ts';

test('decodeEncodedPolyline decodes standard Google polyline string', () => {
  const pts = decodeEncodedPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(pts.length, 3);
  assert.ok(Math.abs(pts[0].lat - 38.5) < 0.001);
  assert.ok(Math.abs(pts[0].lng - -120.2) < 0.001);
});

test('formatRouteDistance and formatRouteDuration format metrics cleanly', () => {
  assert.equal(formatRouteDistance(450), '450 m');
  assert.equal(formatRouteDistance(2450), '2,5 km');
  assert.equal(formatRouteDuration(45), '45 s');
  assert.equal(formatRouteDuration(900), '15 min');
  assert.equal(formatRouteDuration(4500), '1 h 15 min');
});
