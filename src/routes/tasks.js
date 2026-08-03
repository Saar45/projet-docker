const express = require('express');
const Task = require('../models/task');

const router = express.Router();

const VALID_STATUSES = ['todo', 'in_progress', 'done'];
// Limite de taille explicite : une description de 50 000 caractères
// doit être refusée avec un 400 clair, jamais faire tomber le serveur.
const MAX_DESCRIPTION_LENGTH = 500;

function validateTask({ description, status }, { requireDescription } = {}) {
  if (requireDescription && description === undefined) {
    return 'description est obligatoire';
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || description.trim() === '') {
      return 'description doit être une chaîne non vide';
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return `description ne doit pas dépasser ${MAX_DESCRIPTION_LENGTH} caractères`;
    }
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return `status doit être parmi : ${VALID_STATUSES.join(', ')}`;
  }
  return null;
}

// POST /api/tasks : créer une tâche
router.post('/', async (req, res) => {
  const { description, status } = req.body || {};
  const error = validateTask({ description, status }, { requireDescription: true });
  if (error) return res.status(400).json({ error });
  const task = await Task.create({ description, status });
  res.status(201).json(task);
});

// GET /api/tasks : lister toutes les tâches
router.get('/', async (req, res) => {
  res.json(await Task.findAll());
});

// GET /api/tasks/:id : voir une tâche
router.get('/:id', async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(task);
});

// PUT /api/tasks/:id : modifier une tâche
router.put('/:id', async (req, res) => {
  const { description, status } = req.body || {};
  if (description === undefined && status === undefined) {
    return res.status(400).json({ error: 'aucun champ à modifier (description ou status attendu)' });
  }
  const error = validateTask({ description, status });
  if (error) return res.status(400).json({ error });
  const task = await Task.update(req.params.id, { description, status });
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(task);
});

// DELETE /api/tasks/:id : supprimer une tâche
router.delete('/:id', async (req, res) => {
  const removed = await Task.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Tâche introuvable' });
  res.status(204).end();
});

module.exports = router;
