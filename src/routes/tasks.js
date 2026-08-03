const express = require('express');
const Task = require('../models/task');

const router = express.Router();

// POST /api/tasks : créer une tâche
router.post('/', (req, res) => {
  const { description, status } = req.body;
  const task = Task.create({ description, status });
  res.status(201).json(task);
});

// GET /api/tasks : lister toutes les tâches
router.get('/', (req, res) => {
  res.json(Task.findAll());
});

// GET /api/tasks/:id : voir une tâche
router.get('/:id', (req, res) => {
  const task = Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(task);
});

// PUT /api/tasks/:id : modifier une tâche
router.put('/:id', (req, res) => {
  const { description, status } = req.body;
  const task = Task.update(req.params.id, { description, status });
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(task);
});

// DELETE /api/tasks/:id : supprimer une tâche
router.delete('/:id', (req, res) => {
  const removed = Task.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Tâche introuvable' });
  res.status(204).end();
});

module.exports = router;
