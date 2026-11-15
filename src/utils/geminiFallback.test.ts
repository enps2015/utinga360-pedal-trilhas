import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeminiAttemptConfigs,
  classifyGeminiAttemptError,
} from './geminiFallback';

test('buildGeminiAttemptConfigs includes public production fallback models', () => {
  const configs = buildGeminiAttemptConfigs();
  const models = configs.map((c) => c.model);
  assert.ok(models.includes('gemini-4-hydrogen'));
  assert.ok(models.includes('gemini-2.5-flash'));
  assert.ok(models.includes('gemini-2.5-flash-lite'));
  assert.equal(configs[0].toolMode, 'maps');
  assert.equal(configs[configs.length - 1].toolMode, 'none');
});

test('buildGeminiAttemptConfigs prioritizes custom GEMINI_MODEL when provided', () => {
  const configs = buildGeminiAttemptConfigs('gemini-2.5-pro');
  assert.equal(configs[0].model, 'gemini-2.5-pro');
  assert.equal(configs[0].toolMode, 'maps');
});

test('classifyGeminiAttemptError triggers fallback on 404 model unavailable', () => {
  const res = classifyGeminiAttemptError(
    { status: 404, message: 'models/gemini-4-hydrogen is not found for API version v1beta' },
    'maps'
  );
  assert.equal(res.isModelUnavailable, true);
  assert.equal(res.shouldTryNext, true);
});

test('classifyGeminiAttemptError stops on invalid API key (400 without tool error)', () => {
  const res = classifyGeminiAttemptError(
    { status: 400, message: 'API_KEY_INVALID: API key not valid' },
    'none'
  );
  assert.equal(res.shouldTryNext, false);
});
