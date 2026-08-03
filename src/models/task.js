const crypto = require('node:crypto');

// Stockage en mémoire : un simple tableau suffit pour valider les routes
// avant de brancher quoi que ce soit de persistant.
const tasks = [];

function findAll() {
  return tasks;
}

function findById(id) {
  return tasks.find((task) => task.id === id) || null;
}

function create({ description, status = 'todo' }) {
  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    description,
    status,
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  return task;
}

function update(id, { description, status }) {
  const task = findById(id);
  if (!task) return null;
  if (description !== undefined) task.description = description;
  if (status !== undefined) task.status = status;
  task.updatedAt = new Date().toISOString();
  return task;
}

function remove(id) {
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return false;
  tasks.splice(index, 1);
  return true;
}

module.exports = { findAll, findById, create, update, remove };
