import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecipients, isValidEmail } from './email-validator';

test('isValidEmail accepts valid and rejects invalid', () => {
  assert.equal(isValidEmail('a@b.com'), true);
  assert.equal(isValidEmail('bad-email'), false);
  assert.equal(isValidEmail('x@y'), false);
});

test('normalizeRecipients lowercases, trims, dedupes and drops invalid', () => {
  const result = normalizeRecipients([
    'RAHUL@gmail.com',
    ' rahul@gmail.com ',
    'invalid-email',
    'arun@gmail.com',
  ]);
  assert.deepEqual(result.valid, ['rahul@gmail.com', 'arun@gmail.com']);
  assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.invalidIgnored, 1);
});
