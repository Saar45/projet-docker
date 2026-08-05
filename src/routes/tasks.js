const express = require('express');
const Task = require('../models/task');
const { validateTask } = require('../validation');

const router = express.Router();

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
