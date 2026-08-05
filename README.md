# Todo API

API de gestion de tâches (CRUD) construite avec Node.js / Express, dockerisée avec PostgreSQL pour la persistance et un service de statistiques en Python. Projet fil rouge du cours Docker.

## Architecture

- **api** : l'API Todo (Node.js / Express), CRUD complet sur les tâches, stockage PostgreSQL
- **db** : PostgreSQL 16, données persistées dans le volume nommé `todo_pgdata`, jamais exposé sur la machine hôte
- **stats-api** : service Python (FastAPI) qui lit la même base et expose le nombre de tâches par état
- **adminer** : interface web d'administration de la base
- le tout sur un network custom `todo-network`, piloté par Docker Compose, configuré uniquement par variables d'environnement

## Lancer le projet

Prérequis : Docker. Puis :

```bash
git clone https://github.com/Saar45/projet-docker.git
cd projet-docker
cp .env.example .env   # puis remplir ses propres valeurs
docker compose up -d
```

Les services répondent sur :

- `http://localhost:3000` : l'API Todo
- `http://localhost:8000/stats` : les statistiques par état (`http://localhost:8000/health` pour l'état du service)
- `http://localhost:8080` : Adminer (serveur `db`, puis les identifiants du `.env`)

### Déploiement depuis le registry (sans code source)

Les images sont publiées sur Docker Hub (`nabysarr16/todo-api`, `nabysarr16/stats-api`). Dans un dossier contenant uniquement `docker-compose.prod.yml` et un `.env` :

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Lancer l'API seule, sans Docker (développement)

```bash
npm install
npm start   # nécessite un PostgreSQL joignable avec les variables du .env
```

## Les routes de l'API

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

## Tableau de mesures

| Image | Taille | Couches (poids max) | Build froid / chaud | Temps 1re réponse HTTP |
|---|---|---|---|---|
| todo-api 1.0.0 | 227 Mo | 18 (152 Mo : node + npm + yarn de l'image de base) | 44,3 s¹ / 1,0 s | 6,3 s² |
| todo-api 1.0.1 (optimisée) | 188 Mo | 13 (120 Mo : le binaire node seul) | 10,5 s / 1,0 s | 6,3 s² |
| stats-api 1.0.0 | 236 Mo | 21 (44,6 Mo : paquets Debian de python:slim) | 7,0 s / 0,7 s | 6,9 s² |

¹ mesure qui incluait le téléchargement initial de l'image de base ; à images de base déjà présentes, le build à froid de la 1.0.0 est comparable à celui de la 1.0.1.
² mesuré depuis `docker compose up -d` sur une stack arrêtée, jusqu'au premier `200` sur `/health` (boucle `curl` toutes les 100 ms). L'essentiel du délai vient de l'attente du healthcheck Postgres (`condition: service_healthy`, intervalle 5 s) : le conteneur API lui-même répond en moins d'une seconde une fois démarré.

## Journal de bord

**Le socle** : CRUD testé avec les 3 cas demandés, tous passent : création + `GET` renvoie la tâche avec son `id` généré, un `GET` sur un id inexistant renvoie un `404` propre, un `POST` malformé ou une description de 50 000 caractères est refusé avec un `400` clair (limite explicite à 500 caractères), sans jamais faire tomber le serveur. Premier accroc : pendant les tests, le `POST` de 50 000 caractères est passé en `201` alors que la validation était en place — en réalité, un ancien process du serveur (lancé avant l'ajout de la validation) occupait toujours le port 3000 et répondait à la place du nouveau. Un `pkill` + vérification `lsof -i :3000` avant de relancer, et les tests sont repassés au vert. Leçon : toujours vérifier *quel* process répond avant de conclure qu'un test échoue.

**Dockerfile de production** : image épinglée `node:22.14.0-alpine`, build multi-stage (un stage `deps` qui fait le `npm ci --omit=dev`, un stage final qui ne récupère que `node_modules`, `package*.json` et `src/`), `USER node`, `HEALTHCHECK` sur `/health` et `CMD` en forme exec. Mesures : build à froid **44,3 s**, build à chaud **1,0 s** ; après une modification du code seul, la couche `RUN npm ci --omit=dev` reste `CACHED` (l'ordre dépendances-avant-code protège bien le cache). Contexte de build : **114 octets** transférés grâce au `.dockerignore`. Vérifications : `docker run --rm todo-api whoami` répond `node` (jamais root), `ls node_modules | grep -c jest` répond `0`, et la racine de l'image ne contient ni `.git`, ni `.env`, ni `tests/`. Taille de l'image : **226 Mo** — au-dessus de l'objectif des 150 Mo du chapitre 10, l'essentiel vient de l'image de base ; à optimiser lors de la phase de mesure.

**Networks et volumes — Mission A (persistance)** : Postgres lancé à la main sur le bridge par défaut, avec un volume nommé :

```bash
docker volume create todo-pgdata
docker run -d --name todo-postgres \
  -e POSTGRES_USER=todo_user -e POSTGRES_PASSWORD=todo_pass -e POSTGRES_DB=todo_db \
  -v todo-pgdata:/var/lib/postgresql/data \
  postgres:16.6-alpine
```

L'IP interne trouvée via `docker inspect` : `172.17.0.2`, passée à l'API en `DB_HOST` puisque le bridge par défaut ne résout pas les noms. Ça représente 5 étapes manuelles (volume, run Postgres, inspect de l'IP, run API avec 4 `-e`, re-inspect à chaque redémarrage puisque l'IP peut changer) là où on imagine bien un seul fichier décrire le tout. Résultats : une tâche créée via l'API survit à un `docker stop`/`start` de Postgres, et survit aussi à un `docker rm -f` suivi d'un `docker run` tout neuf pointé sur le même volume — la donnée vit dans le volume, pas dans le conteneur. Cas adverse : `docker kill` sur Postgres pendant que l'API tourne → le `POST` suivant répond `503 {"error":"base de données injoignable"}` et `/health` répond toujours, pas de crash silencieux.

**Networks et volumes — Mission B (isolation réseau)** : `docker network create todo-network`, les deux conteneurs relancés dessus, le conteneur Postgres nommé `db` et l'API configurée avec `DB_HOST=db` — plus jamais d'IP. Le `-p 5432:5432` n'a jamais été publié : depuis l'hôte, `nc -zv localhost 5432` répond `Connection refused`, ce qui est exactement le comportement attendu (la base n'est joignable que par les conteneurs du network custom, l'hôte n'y a plus accès). `docker network inspect todo-network` liste bien `db` et `todo-api-run`, et toutes les routes CRUD continuent de répondre normalement via la résolution DNS interne du network.

**Compose et configuration** : la config est sortie du code (dotenv + `.env` non commité + `.env.example` commité, démarrage qui plante avec `La variable d'environnement DB_PASSWORD doit être définie` si une variable manque), puis toute la stack tient dans `docker-compose.yml` : `api` (build local), `db` (postgres:16.6-alpine, volume nommé `todo_pgdata`, aucun port publié, healthcheck `pg_isready`) et `adminer`, tous sur le network `todo-network`, zéro valeur en dur (tout vient du `.env` via interpolation). `docker compose up -d` crée les 5 ressources en ~20 s, le healthcheck Postgres passe `Healthy` en ~5 s et l'API n'est démarrée qu'après (`condition: service_healthy`). Scénario limite rejoué : `DB_PASSWORD` commenté dans le `.env` → Compose warne `variable is not set, defaulting to a blank string`, et contrairement à ce que prédit l'énoncé, la base démarre quand même (le volume était déjà initialisé, Postgres n'a plus besoin du mot de passe pour *démarrer*) : c'est l'**API** qui bloque, en boucle `Restarting (1)` à cause de notre fail-fast — la variable manquante ne casse jamais silencieusement, mais le symptôme se déplace selon l'état du volume. Scénario adverse : `docker compose stop db` avec la stack up → `GET /api/tasks` répond `503 {"error":"base de données injoignable"}` et `/health` reste à 200 ; après `docker compose start db`, l'API retrouve la base d'elle-même, sans redémarrage (le pool `pg` rouvre ses connexions à la requête suivante).

**Service Python stats-api** : le code FastAPI fourni est branché tel quel — les constantes `TABLE_NAME = "tasks"` et `STATUS_COLUMN = "status"` correspondaient déjà exactement au schéma créé au chapitre 6, et les variables `DB_*` lues par `get_connection()` sont les mêmes clés que celles de l'API Node (`env_file: .env` partagé), donc **zéro ligne de Python modifiée**. Service ajouté au compose : build depuis `./stats_api`, même network `todo-network`, port 8000 publié (celui de l'`EXPOSE` du Dockerfile). Checklist de sortie rejouée : cas nominal, `/stats` renvoie `{"todo":1,"in_progress":1,"done":2}`, strictement identique au `COUNT` manuel exécuté via `psql` dans le conteneur `db` ; cas limite, après un `TRUNCATE tasks`, `/stats` répond `200` avec les trois compteurs à zéro (grâce à `KNOWN_STATUSES`), jamais un 500 ; cas adverse, base coupée (`docker compose stop db`), `/stats` répond `503 {"detail":"stats-api ne parvient pas à joindre la base de données"}` — un message exploitable, pas un timeout silencieux ni un stacktrace psycopg2 brut. `docker network inspect` liste bien `stats-api` à côté de `db` et `api`.

**Registry** : les deux images sont taguées selon la convention `pseudo/projet:version` puis poussées sur Docker Hub : `nabysarr16/todo-api:1.0.0` et `nabysarr16/stats-api:1.0.0` (tag de version explicite, jamais `latest`). Premier accroc, riche en enseignement : `docker push` refusait avec `push access denied / insufficient_scope` alors que des credentials traînaient dans le trousseau — le token local avait expiré, puis, une fois reconnecté, le push échouait *encore* parce que les images étaient taguées `saar45/...` alors que le compte Docker Hub connecté est `nabysarr16` : on ne pousse que dans le namespace de son propre compte, le tag doit correspondre à l'identité de la session. Retag + push, et les deux digests sont confirmés côté registry. Critère de réussite rejoué : dans un dossier vide contenant uniquement `docker-compose.prod.yml` (des `image:` au lieu des `build:`) et un `.env`, après suppression des tags locaux pour forcer le pull, `docker compose -f docker-compose.prod.yml up -d` télécharge les images depuis le registry et toute la stack démarre — POST 201 sur l'API, `/stats` cohérent — sans qu'une seule ligne de code source soit présente sur la machine. Vérification adverse : `docker history --no-trunc` sur les deux images publiées ne fait apparaître aucun secret ni valeur du `.env` (seuls matchs : les `ENV NODE_VERSION` de l'image de base et le `adduser --disabled-password`, des faux positifs).

**Mesurer et optimiser** : le tableau de mesures ci-dessus a été rempli une première fois, puis `docker history` a révélé le vrai profil de `todo-api` : les couches applicatives ne pèsent que ~5,8 Mo, et une seule couche de l'image de base fait **152 Mo** (le binaire node + npm + yarn + corepack). Optimisation tentée et mesurée : le stage final ne part plus de `node:22.14.0-alpine` mais d'`alpine:3.21` nu, dans lequel on copie uniquement le binaire `/usr/local/bin/node` depuis le stage de build (+ `apk add libstdc++`, auquel node est lié dynamiquement, + création manuelle de l'utilisateur `node`). Résultat : **227 → 188 Mo (−17 %)**, 18 → 13 couches, ni `npm` ni `yarn` dans l'image finale, et aucune régression (non-root conservé, healthcheck `healthy`, CRUD et `/stats` inchangés, temps de première réponse identique). L'objectif des 150 Mo n'est **pas atteint, et c'est justifié** : le binaire node seul pèse 120 Mo sur arm64 — c'est le plancher incompressible tant qu'on garde ce runtime, et c'est ici que le compromis compression/débuggabilité a été tranché (on garde un `sh` et un vrai shell Alpine plutôt que distroless, pour pouvoir `docker exec` en dépannage). Côté `stats-api`, pas d'optimisation rentable : `psycopg2-binary` ne publie pas de wheel musl, passer sur Alpine imposerait gcc + compilation (le piège exact décrit dans le cours), et `python:3.12-slim` constitue le plancher — 236 Mo assumés. Coût du build à froid en pipeline : à 10,5 s × 50 builds/jour ≈ **9 minutes de calcul par jour** (contre ~37 min avec les 44,3 s de la version non optimisée en cache froid complet) — c'est exactement pourquoi l'ordre des instructions et le cache de couches deviennent un sujet sérieux à cette fréquence. Écart démarrage/disponibilité : le conteneur API répond en <1 s, mais la première réponse HTTP de la stack arrive à ~6,3 s, dominée par l'intervalle du healthcheck Postgres (5 s) que `condition: service_healthy` impose d'attendre.

**Échauffement J2 — fichier 1, l'erreur subtile** : le build passe et le conteneur tourne, le symptôme est invisible à l'exécution. Cause double : `COPY package.json ./` oublie le lock file (en J1 on écrivait `COPY package*.json ./`), donc `npm install` réinstalle sans versions épinglées — deux builds à deux dates peuvent produire deux images différentes ; et `CMD npm start` en forme shell fait de `npm` le PID 1 (`ps` dans le conteneur : PID 1 = `npm start`, node relégué en PID 18). Sur cette version d'npm, le `docker stop` est resté rapide (~0,7 s, npm relaie SIGTERM), mais ce relais n'est pas garanti par contrat. Correction : `COPY package*.json ./` + `npm ci`, et `CMD ["node", "server.js"]` en forme exec pour que node reçoive SIGTERM en direct.

**Échauffement J2 — fichier 2, l'ordre compte** : pas de plantage, une lenteur. Protocole rejoué : build initial, modification d'une seule ligne de `server.js`, rebuild — la couche `RUN npm install` est **rejouée** au lieu d'afficher `CACHED`, parce que `COPY . .` la précède : toute modif de code invalide la couche de copie, donc tout ce qui suit. Sur la mini-app l'écart est faible (~2,1 s vs ~1,3 s, cache npm chaud) ; sur un vrai projet c'est le rebuild de 5 s qui devient 2 min vu en J1. Correction vérifiée : `COPY package*.json ./` puis `RUN npm install` puis `COPY . .` — après modif de code, la couche d'install reste `CACHED`.

**Échauffement J2 — fichier 3, l'image géante** : 1,56 Go mesuré au `docker images`. Trois causes distinctes, chacune avec sa parade de J1 : (1) `FROM node:18` complet embarque une Debian entière (~1 Go de couches de base) → `node:22-alpine` ; (2) `COPY . .` sans `.dockerignore` embarque le `node_modules` local, les Dockerfiles et le compose (prouvé par `ls /app` dans l'image) → `.dockerignore` ; (3) `npm install` avec les dépendances de dev et aucun multi-stage : sources + `dist/` + outillage cohabitent dans l'image finale → `npm ci --omit=dev` + multi-stage qui ne garde que le nécessaire.

**Échauffement J2 — fichier 4, le compose qui ne se parle pas** : trois défauts à trois moments différents. (1) `db-data` sans deux-points sous `volumes:` → le fichier est refusé d'entrée : `volumes must be a mapping` ; correction `db-data:`. (2) Une fois le fichier lisible, la stack démarre mais `DB_HOST: postgres` alors que le service s'appelle `database` : depuis le conteneur web, `getent hosts postgres` échoue et `getent hosts database` répond `172.28.0.2` — l'app cherche un nom DNS qui n'existe pas sur le network ; correction : `DB_HOST: database`. (3) Le défaut invisible : `version: '3.8'`, obsolète, provoque un warning à chaque commande → on retire la ligne. Bonus vécu en direct : le premier `up` a été refusé avec `Bind for 0.0.0.0:3000 failed: port is already allocated` — la stack Todo API d'hier tournait encore ; un `docker compose down` dans le projet d'hier et c'est reparti. C'est la première ligne du tableau des six erreurs du cours, rencontrée sans le faire exprès.

**J3 — Phase 1, la pipeline déménage sur la Todo API** : la validation a d'abord été extraite dans `src/validation.js` pour donner au job `test` de vrais tests à lancer (7 tests unitaires `node --test`, verts). Le workflow `.github/workflows/ci.yml` fait deux jobs : `test` sur toutes les branches, et `build` (`needs: test`, `if: main`) qui pousse `nabysarr16/todo-api:<sha>` sur Docker Hub via les secrets `DOCKERHUB_USER`/`DOCKERHUB_TOKEN` — le token est un access token dédié, jamais le mot de passe du compte, et il n'apparaît nulle part dans le YAML. Premier run : vert, et le tag `5efba89f...` est apparu sur Docker Hub à côté des `1.0.0`/`1.0.1` du Jour 1 poussés à la main — c'était exactement le trou décrit en ouverture du cours, rien ne reconstruisait la Todo API automatiquement. Vérification faite : un push sur une branche de travail donne `test: success, build: skipped`, rien ne part vers le registry depuis une branche.

**J3 — Phase 2, la machine cible** : la paire `ssh-keygen -t ed25519` a été générée **après** avoir mis `deploy_key` dans le `.gitignore` (commit dédié, la clé privée n'a jamais été visible de git — seule `deploy_key.pub` part dans le dépôt puisque le `Dockerfile.vm` la copie dans `authorized_keys`). La maquette est un `docker:28-dind` + `openssh-server`, lancée en `--privileged` avec les ports 2222 (SSH), 3000 (API), 9090 (Prometheus), 3001 (Grafana) et le volume `vm-prod-data` monté sur `/var/lib/docker`. Premier accroc prévu par le doc et rencontré : le build a échoué une première fois sur un `DeadlineExceeded` pendant le pull de `docker:28-dind` (réseau lent) — un `docker pull` explicite puis rebuild, et c'est passé. Les trois vérifications : `ssh -i deploy_key -p 2222 root@localhost` ouvre un shell distant où `docker run --rm hello-world` fonctionne et où `docker ps` ne montre **aucun** conteneur de mon poste (isolation prouvée) ; la même connexion **sans** la clé est refusée `Permission denied (publickey...)` ; après un `docker restart vm-prod`, les images téléchargées sont toujours là grâce au volume.

**J3 — Phase 3, le runner chez nous** : runner self-hosted `mac-mouhamed` enregistré sur le repo (`config.sh` avec un jeton d'enregistrement à usage unique tiré via l'API, `run.sh` qui doit rester lancé — s'il s'arrête, les jobs restent "Queued" sans erreur, comportement à connaître avant de le découvrir en panique). Preuve de bon fonctionnement : un workflow `runner-check` en `workflow_dispatch` (jamais déclenché par un push, règle de sécurité des runners self-hosted sur dépôt public) avec `runs-on: self-hosted` affiche `MacBook-Pro-de-Mouhamed.local` et les conteneurs du poste, dont `vm-prod` — le job tourne bien ici, à côté de la machine cible, là où le runner GitHub hébergé ne pourrait jamais la joindre. Décision d'architecture du doc respectée : chaque job choisit son runner — les tests restent sur `ubuntu-latest`, seul le déploiement tournera en self-hosted.

**J3 — Phase 4, le job qui déploie** : `/srv/todo` sur la machine cible reçoit un `.env` copié une seule fois à la main (mots de passe générés, jamais dans le dépôt), et le `compose.yml` de production versionné dans le repo — `image: nabysarr16/todo-api:${TAG}`, `container_name` fixes, plus aucun `build:`. Le job `deploy` (`needs: build`, `if: main`, `runs-on: self-hosted`) charge la clé dans un **agent SSH** (`webfactory/ssh-agent` : la clé vit en mémoire, jamais sur le disque du runner), `scp` le compose, lance `TAG=<sha> docker compose up -d` à distance et boucle sur `curl /health` en faisant échouer le job si l'API ne répond pas. Point d'architecture noté : l'image est buildée en amd64 par `ubuntu-latest` et la maquette est arm64 — elle tourne quand même (émulation Rosetta de la VM Docker Desktop, un warning `platform mismatch` dans les logs), acceptable pour la maquette, et c'est exactement ce que les builds multi-arch `buildx` du J1 résoudraient proprement. Les trois scénarios : un push sur `main` a déroulé `test → build → deploy` verts et l'API répond sur la machine cible sans aucune commande manuelle ; une branche ne déploie rien (prouvé en phase 1) ; le secret `DEPLOY_SSH_KEY` volontairement corrompu fait échouer le job avec un message net (`Error loading key: invalid format`) et un grep de la vraie clé dans les logs du run renvoie **0 occurrence** — restauration du secret, re-run, et le déploiement repasse vert.

**J3 — Phase 5, rejouer et revenir en arrière** : le même déploiement rejoué (re-run du job `deploy`, même TAG) laisse la production strictement identique — mêmes IDs de conteneurs avant/après, aucun conflit de nom ni de port : `docker compose up -d` compare l'état voulu à l'état réel et ne touche à rien, l'idempotence est gratuite là où une séquence naïve de `docker run` aurait planté. Ensuite, la régression volontaire : un `GET /api/tasks` cassé exprès, poussé sur `main` — **la pipeline est passée verte et l'a déployé en prod** (les tests unitaires ne couvrent pas les routes : c'est le trou exact que la phase 6 doit boucher), constat en prod à 16:04:55, `500 {"error":"Erreur interne du serveur"}`. Rollback : `ssh` sur la machine cible puis `cd /srv/todo && TAG=ef19d873cb82c05c5328a421035f68aea4b10477 docker compose up -d` → **service rétabli en 12,2 s** (commande → premier 200), données intactes, aucun build, aucune pipeline — l'image du commit précédent dormait déjà sur Docker Hub, c'est tout l'intérêt du tag au sha. Cas limite : un rollback vers `TAG=deadbeef` échoue **franchement** (`manifest unknown`) et laisse la prod debout sur la bonne version, toujours en 200. Enfin `git revert` de la régression, push, et la pipeline a redéployé la version saine toute seule. **La commande de rollback est LA ligne à retenir pour la procédure** : `TAG=<sha précédent> docker compose up -d` dans `/srv/todo`.

**J3 — Phase 6, les tests qui touchent la base** : quatre tests d'intégration supertest contre un **vrai** PostgreSQL, couvrant les quatre comportements demandés — créer puis relire à l'identique par id, 404 propre sur id inexistant (y compris un id qui n'est pas un UUID), 400 clair sur corps invalide (description absente et description de 50 000 caractères) avec vérification que rien n'a été écrit en base, suppression puis disparition vérifiée. Chaque test repart d'une table vide (`TRUNCATE` en `beforeEach`) : aucun test ne dépend d'un autre ni d'un état laissé la veille. Côté pipeline : un job `test-integration` avec un `services: postgres` jetable (healthcheck `pg_isready`, sans lequel les tests partent avant la base et échouent une fois sur trois), joignable sur `localhost` — la règle différente du docker-compose, notée pour ne pas y perdre une heure. `build` exige désormais `needs: [test, test-integration]`. **La preuve qui compte** : la même régression volontaire qu'en phase 5, celle qui était partie en prod avec une pipeline verte, a été rejouée sur une branche — cette fois `test-integration: failure`, `build: skipped`, `deploy: skipped`. Le trou de vendredi 17h32 est bouché : un test vert qui ne devient jamais rouge ne teste rien, celui-ci vient de prouver qu'il sert.

**J3 — Phase 7, rendre l'API mesurable** : instrumentation `prom-client` dans son propre commit (jamais mélangée à une correction de route) — une route `/metrics` en texte brut, le counter `http_requests_total{method,route,status}`, l'histogramme `http_request_duration_seconds` (buckets de 50 ms à 5 s, celui du futur p95), et la métrique métier `tasks_created_total`, la seule que personne d'autre ne peut deviner. Le test qui compte, exécuté en local : trois appels sur `GET /api/tasks`, et le compteur passe de 0 à **exactement 3**. Les deux pièges du doc sont couverts et prouvés : une URL inconnue est comptée elle aussi (`route="non_routee", status="404"` — sous un label fixe et borné, pas l'URL brute), et l'identifiant d'une tâche n'apparaît **nulle part** dans `/metrics` (grep de l'UUID : 0 occurrence ; le label est `/api/tasks/:id`, la route déclarée, jamais l'URL réelle — c'est le piège de cardinalité qui fait tomber Prometheus). Un push, et la prod expose `/metrics` toute seule : la pipeline de la phase 4 a fait le déploiement.

**J3 — Phase 8, Prometheus et Grafana sur la machine cible** : toute la surveillance est du code versionné dans `monitoring/` (le `prometheus.yml` qui scrape `todo-api:3000` toutes les 5 s — le nom du service, pas une IP —, le provisioning Grafana et le dashboard JSON), envoyée sur la machine cible par la pipeline et jamais modifiée en prod. La datasource pointe sur `http://prometheus:9090`, le nom du réseau interne — pas `localhost:9090`, qui depuis le conteneur Grafana désignerait Grafana lui-même (le quart d'heure perdu annoncé par le cours, évité). Le dashboard suit les quatre golden signals (Disponibilité `up`, Trafic `rate`, Erreurs `5xx`, Latence p95) plus la métrique métier. Le relevé aux trois moments :

| Moment | up | Requêtes/s | Taux d'erreur | p95 |
|---|---|---|---|---|
| Au repos (seul Prometheus scrape) | 1 | 0,22 | 0 % | 47,5 ms |
| Pendant la boucle de charge | 1 | 8,37 (2,95 en 200 / 2,72 en 201 / 2,72 en 404) | 0 % | 47,6 ms |
| Pendant l'incident (base coupée, API debout) | **1** | 5,53 | **19 % et en hausse** | 47,5 ms |

Checkpoint qualité rejoué : `docker stop todo-api` fait tomber `up` à **0 en 15 s** (un scrape raté suffit, sans recharger la page) ; couper la **base** sans couper l'API produit la signature inverse — `up` reste à 1, la cible répond, mais les 5xx explosent (les `503 base de données injoignable` de l'API). Deux pannes, deux images distinctes sur le même tableau de bord : c'est exactement ce que le pilote de la passation devra reconnaître. Accès Grafana : `localhost:3001`, admin/admin (maquette). La ligne du tableau « incident phase 10 » sera re-relevée en direct pendant la passation.

**J3 — Phase 9, la procédure de déploiement** : `docs/PROCEDURE_DEPLOIEMENT.md`, versionnée avec le code, écrite pour son seul vrai lecteur — quelqu'un qui n'a jamais vu cette machine. Elle contient les prérequis avec un test d'accès de 30 secondes, la commande qui donne la version qui tourne (« noter ce sha : c'est lui qui servira au retour arrière »), le déploiement normal (un push) et manuel, **un point de vérification observable après chaque étape**, le rollback avec sa table de décision signal → action (aucune ligne interprétable : > 5 % de 5xx pendant 5 min = rollback immédiat sans validation), la table des six pannes connues avec leur **signature Grafana** (celles observées en phase 8 : `up=0` vs `up=1`+5xx, plus le runner en Queued, le port occupé…), et les durées attendues. Mise à l'épreuve avant la passation, comme exigé : chaque commande a été exécutée **telle qu'écrite** — et le test a attrapé une vraie faute, un `scp ... -i deploy_key` avec l'option placée après la destination, qui échoue sur `Not a directory`. Un pilote à 3h du matin serait resté coincé dessus. Corrigée, retestée, verte. Une procédure sans test, c'est une procédure avec des trous qu'on découvre au pire moment.