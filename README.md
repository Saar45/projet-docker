# Todo API

API de gestion de tâches (CRUD) construite avec Node.js / Express, dockerisée avec PostgreSQL pour la persistance et un service de statistiques en Python. Projet fil rouge du cours Docker.

## Lancer le projet

```bash
npm install
npm start
```

L'API répond sur `http://localhost:3000` :

- `GET /health` : état du serveur
- `POST /api/tasks` : créer une tâche
- `GET /api/tasks` : lister toutes les tâches
- `GET /api/tasks/:id` : voir une tâche
- `PUT /api/tasks/:id` : modifier une tâche
- `DELETE /api/tasks/:id` : supprimer une tâche

Modèle d'une tâche :

```json
{
  "id": "uuid",
  "description": "string",
  "status": "todo | in_progress | done",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## Journal de bord
