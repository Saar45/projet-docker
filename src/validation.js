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

module.exports = { validateTask, VALID_STATUSES, MAX_DESCRIPTION_LENGTH };
