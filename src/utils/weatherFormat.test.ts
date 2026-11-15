import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeatherReferenceNotes,
  findBestWeatherWindows,
  formatAlertSeverityPt,
  formatBelemTimestamp,
  formatWeatherConditionPt,
  formatWindCardinalPt,
} from './weatherFormat.ts';

test('formatBelemTimestamp converts UTC timestamp to America/Belem local time', () => {
  const formatted = formatBelemTimestamp('2026-11-13T15:30:00Z');
  assert.match(formatted, /13\/11\/2026/);
  assert.match(formatted, /12:30/);
});

test('formatWindCardinalPt and formatAlertSeverityPt localize API enums', () => {
  assert.equal(formatWindCardinalPt('NORTH_NORTHEAST'), 'Norte-Nordeste (NNE)');
  assert.equal(formatAlertSeverityPt('SEVERE'), 'Severidade Alta');
});

test('formatWeatherConditionPt translates English phrases and condition types to Portuguese', () => {
  assert.equal(
    formatWeatherConditionPt('PARTLY_CLOUDY', 'Partly sunny'),
    'Parcialmente ensolarado'
  );
  assert.equal(
    formatWeatherConditionPt('SCATTERED_THUNDERSTORMS', 'Scattered thunderstorms'),
    'Trovoadas isoladas'
  );
  assert.equal(formatWeatherConditionPt('HEAVY_RAIN', null), 'Chuva forte');
});

test('buildWeatherReferenceNotes always provides non-guarantee guidance', () => {
  const calmNotes = buildWeatherReferenceNotes({
    precipitationProbability: 10,
    thunderstormProbability: 5,
    temperatureC: 27,
    uvIndex: 3,
  });
  assert.equal(calmNotes.length, 1);
  assert.match(calmNotes[0], /não garante segurança/);

  const stormNotes = buildWeatherReferenceNotes({
    precipitationProbability: 70,
    thunderstormProbability: 45,
    temperatureC: 32.5,
    uvIndex: 8,
  });
  assert.equal(stormNotes.length, 4);
});

test('findBestWeatherWindows picks hours with lowest precipitation probability', () => {
  const windows = findBestWeatherWindows([
    { hourLabel: '14:00', precipitationProbability: 65, tempC: 31 },
    { hourLabel: '15:00', precipitationProbability: 10, tempC: 29 },
    { hourLabel: '16:00', precipitationProbability: 10, tempC: 27 },
    { hourLabel: '17:00', precipitationProbability: 25, tempC: 26 },
    { hourLabel: '18:00', precipitationProbability: null, tempC: 25 },
  ]);
  assert.equal(windows.length, 3);
  assert.equal(windows[0].hourLabel, '16:00');
  assert.equal(windows[1].hourLabel, '15:00');
  assert.equal(windows[2].hourLabel, '17:00');
});

