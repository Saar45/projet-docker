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

**Dockerfile de production** : image épinglée `node:22.14.0-alpine`, build multi-stage (un stage `deps` qui fait le `npm ci --omit=dev`, un stage final qui ne récupère que `node_modules`, `package*.json` et `src/`), `USER node`, `HEALTHCHECK` sur `/health` et `CMD` en forme exec. Mesures : build à froid **44,3 s**, build à chaud **1,0 s** ; après une modification du code seul, la couche `RUN npm ci --omit=dev` reste `CACHED` (l'ordre dépendances-avant-code protège bien le cache). Contexte de build : **114 octets** transférés grâce au `.dockerignore`. Vérifications : `docker run --rm todo-api whoami` répond `node` (jamais root), `ls node_modules | grep -c jest` répond `0`, et la racine de l'image ne contient ni `.git`, ni `.env`, ni `tests/`. Taille de l'image : **226 Mo** — au-dessus de l'objectif des 150 Mo du chapitre 10, l'essentiel vient de l'image de base ; à optimiser lors de la phase de mesure.