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

**Le socle** : CRUD testé avec les 3 cas demandés, tous passent : création + `GET` renvoie la tâche avec son `id` généré, un `GET` sur un id inexistant renvoie un `404` propre, un `POST` malformé ou une description de 50 000 caractères est refusé avec un `400` clair (limite explicite à 500 caractères), sans jamais faire tomber le serveur. Premier accroc : pendant les tests, le `POST` de 50 000 caractères est passé en `201` alors que la validation était en place — en réalité, un ancien process du serveur (lancé avant l'ajout de la validation) occupait toujours le port 3000 et répondait à la place du nouveau. Un `pkill` + vérification `lsof -i :3000` avant de relancer, et les tests sont repassés au vert. Leçon : toujours vérifier *quel* process répond avant de conclure qu'un test échoue.
