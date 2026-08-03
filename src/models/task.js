const crypto = require('node:crypto');
const { pool } = require('../db');

// 22P02 : "invalid input syntax", levé quand l'id fourni n'est pas un UUID
// valide. Pour l'API c'est simplement une tâche qui n'existe pas : 404.
const INVALID_UUID = '22P02';

function toTask(row) {
  return {
    id: row.id,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findAll() {
  const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at');
  return rows.map(toTask);
}

async function findById(id) {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows[0] ? toTask(rows[0]) : null;
  } catch (err) {
    if (err.code === INVALID_UUID) return null;
    throw err;
  }
}

async function create({ description, status = 'todo' }) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (id, description, status)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [crypto.randomUUID(), description, status]
  );
  return toTask(rows[0]);
}

async function update(id, { description, status }) {
  try {
    const { rows } = await pool.query(
      `UPDATE tasks
       SET description = COALESCE($2, description),
           status = COALESCE($3, status),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, description ?? null, status ?? null]
    );
    return rows[0] ? toTask(rows[0]) : null;
  } catch (err) {
    if (err.code === INVALID_UUID) return null;
    throw err;
  }
}

async function remove(id) {
  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    return rowCount > 0;
  } catch (err) {
    if (err.code === INVALID_UUID) return false;
    throw err;
  }
}

module.exports = { findAll, findById, create, update, remove };
