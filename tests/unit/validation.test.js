const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateTask, MAX_DESCRIPTION_LENGTH } = require('../../src/validation');

test('une tâche valide passe la validation', () => {
  assert.equal(validateTask({ description: 'faire les courses', status: 'todo' }), null);
});

test('la description est obligatoire à la création', () => {
  assert.match(validateTask({}, { requireDescription: true }), /obligatoire/);
});

test('une description vide ou non-string est refusée', () => {
  assert.match(validateTask({ description: '   ' }), /chaîne non vide/);
  assert.match(validateTask({ description: 42 }), /chaîne non vide/);
});

test('une description démesurée est refusée', () => {
  const enorme = 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1);
  assert.match(validateTask({ description: enorme }), /dépasser/);
});

test('une description à la limite exacte passe', () => {
  const limite = 'a'.repeat(MAX_DESCRIPTION_LENGTH);
  assert.equal(validateTask({ description: limite }), null);
});

test('un statut hors liste est refusé', () => {
  assert.match(validateTask({ description: 'x', status: 'fini' }), /status doit être parmi/);
});

test('la mise à jour partielle (statut seul) est autorisée', () => {
  assert.equal(validateTask({ status: 'done' }), null);
});
