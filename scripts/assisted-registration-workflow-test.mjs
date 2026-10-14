import assert from 'node:assert/strict';
import {
  ASSISTED_FILE_PURPOSES,
  ASSISTED_REGISTRATION_STATUSES,
  assertAssistedSetupMutable,
  assertAssistedTransition
} from '../src/lib/assisted-registration-workflow.js';
import { publicAssistedRegistration } from '../src/lib/assisted-registration.js';

assert.deepEqual(ASSISTED_REGISTRATION_STATUSES, [
  'new', 'in_progress', 'awaiting_menu', 'interpreting_menu', 'reviewing_menu',
  'ready_for_preview', 'preview_created', 'preview_reviewed', 'published', 'activated', 'cancelled'
]);
assert.deepEqual(ASSISTED_FILE_PURPOSES, ['menu_source', 'product_photo', 'store_logo', 'store_cover']);

for (const [from, to] of [
  ['awaiting_menu', 'interpreting_menu'],
  ['interpreting_menu', 'reviewing_menu'],
  ['reviewing_menu', 'ready_for_preview'],
  ['ready_for_preview', 'preview_created'],
  ['preview_created', 'preview_reviewed'],
  ['preview_reviewed', 'published'],
  ['published', 'activated']
]) assert.equal(assertAssistedTransition(from, to), to);

assert.throws(() => assertAssistedTransition('ready_for_preview', 'published'), /Transição inválida/);
assert.throws(() => assertAssistedTransition('preview_created', 'activated'), /Transição inválida/);

assert.equal(assertAssistedSetupMutable('ready_for_preview'), 'ready_for_preview');
for (const status of ['preview_created', 'preview_reviewed', 'published', 'activated', 'cancelled']) {
  assert.throws(() => assertAssistedSetupMutable(status), /prévia|alterado/i);
}

const dto = publicAssistedRegistration({
  id: '00000000-0000-4000-8000-000000000001',
  status: 'preview_created',
  preview_created_at: '2026-09-30T12:00:00.000Z',
  preview_reviewed_at: null,
  preview_menu_version: 4,
  last_import_error_code: 'provider_timeout',
  email_last_error_code: 'smtp_rejected',
  activation_token: 'never-return-this',
  token_hash: 'never-return-this-either',
  answers: {}
});

assert.equal(dto.preview_created_at, '2026-09-30T12:00:00.000Z');
assert.equal(dto.preview_reviewed_at, null);
assert.equal(dto.preview_menu_version, 4);
assert.equal(dto.last_import_error_code, 'provider_timeout');
assert.equal(dto.email_last_error_code, 'smtp_rejected');
assert.equal(dto.activation_token, undefined);
assert.equal(dto.token_hash, undefined);
assert.equal(JSON.stringify(dto).includes('never-return'), false);

console.log('Assisted registration workflow: OK');
