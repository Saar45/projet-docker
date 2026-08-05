// Tests d'intégration : route HTTP + logique métier + VRAIE base PostgreSQL.
// La base est jetable (conteneur de service en CI, conteneur local sinon)
// et chaque test repart d'une table vide : aucun test ne dépend d'un autre.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

before(async () => {
  // Le schéma doit exister avant le premier test : même migration
  // que celle jouée au démarrage de l'application.
  await db.init();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE tasks');
});

after(async () => {
  await db.pool.end();
});

test('crée une tâche puis la relit par son id, à l\'identique', async () => {
  const createRes = await request(app)
    .post('/api/tasks')
    .send({ description: 'tâche d\'intégration', status: 'in_progress' });

  assert.equal(createRes.status, 201);
  const { id } = createRes.body;
  assert.ok(id, 'la création doit renvoyer un id');

  const getRes = await request(app).get(`/api/tasks/${id}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.description, 'tâche d\'intégration');
  assert.equal(getRes.body.status, 'in_progress');
  assert.equal(getRes.body.id, id);
});

test('une tâche inexistante renvoie un 404 propre, jamais une erreur serveur', async () => {
  const res = await request(app).get('/api/tasks/00000000-0000-0000-0000-000000000000');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Tâche introuvable' });

  // Un id qui n'est même pas un UUID ne doit pas produire un 500 non plus.
  const resInvalide = await request(app).get('/api/tasks/nimporte-quoi');
  assert.equal(resInvalide.status, 404);
});

test('un corps invalide est refusé avec un 400 clair', async () => {
  const sansDescription = await request(app).post('/api/tasks').send({ status: 'todo' });
  assert.equal(sansDescription.status, 400);
  assert.match(sansDescription.body.error, /obligatoire/);

  const demesuree = await request(app)
    .post('/api/tasks')
    .send({ description: 'a'.repeat(50000) });
  assert.equal(demesuree.status, 400);

  // Et rien n'a été écrit en base dans les deux cas.
  const liste = await request(app).get('/api/tasks');
  assert.deepEqual(liste.body, []);
});

test('supprime une tâche puis vérifie qu\'elle a bien disparu de la liste', async () => {
  const { body: task } = await request(app)
    .post('/api/tasks')
    .send({ description: 'à supprimer' });

  const delRes = await request(app).delete(`/api/tasks/${task.id}`);
  assert.equal(delRes.status, 204);

  const getRes = await request(app).get(`/api/tasks/${task.id}`);
  assert.equal(getRes.status, 404);

  const liste = await request(app).get('/api/tasks');
  assert.deepEqual(liste.body, []);
});
