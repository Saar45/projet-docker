# Procédure de déploiement — Todo API

> Ce document est un **runbook** : il dit quoi taper, dans quel ordre, et comment
> vérifier que ça a marché. Il se suit sous stress, sans réfléchir.
> Pour comprendre l'architecture, voir le README — pas ici.

## 0. Prérequis et accès (à vérifier AVANT de commencer)

| Quoi | Valeur |
|---|---|
| Machine cible | conteneur `vm-prod` sur le poste (maquette de prod) |
| Accès SSH | `root@localhost`, port `2222` |
| Clé privée | `deploy_key` à la racine du repo local (`~/Developer/devops_ipssi/projet-docker/`), jamais commitée |
| Fichiers sur la machine | `/srv/todo/` : `compose.yml`, `.env` (secrets), `monitoring/` |
| Image | Docker Hub `nabysarr16/todo-api:<sha du commit>` |
| Tableaux de bord | Grafana `http://localhost:3001` (admin/admin) — Prometheus `http://localhost:9090` |
| Pipeline | GitHub → repo `Saar45/projet-docker` → onglet Actions |

Test d'accès (30 secondes, à faire en premier) :

```bash
cd ~/Developer/devops_ipssi/projet-docker
ssh -i deploy_key -p 2222 root@localhost "echo acces ok"
```

**Vérification** : la commande affiche `acces ok`. Sinon, STOP : vérifier que le
conteneur `vm-prod` tourne (`docker ps | grep vm-prod`) — s'il est absent, le
relancer : `docker start vm-prod`, attendre 10 s, retester.

## 1. Connaître la version qui tourne (avant de toucher à quoi que ce soit)

```bash
ssh -i deploy_key -p 2222 root@localhost "docker ps --format '{{.Names}} -> {{.Image}}'"
```

**Vérification** : la ligne `todo-api -> nabysarr16/todo-api:<sha>` s'affiche.
**Noter ce sha quelque part : c'est lui qui servira au retour arrière.**

## 2. Déploiement normal (le cas de tous les jours)

Le déploiement normal, c'est un push sur `main`. Rien d'autre.

```bash
git push origin main
```

**Vérification étape par étape** :

1. Ouvrir l'onglet Actions du repo (ou `gh run watch`) : les jobs `test`,
   `test-integration`, `build`, `deploy` passent au vert. Durée normale : **2 à 4 minutes**.
   Si un job de test est rouge → le code est refusé, la prod n'a pas bougé, rien à faire côté machine.
2. La commande de l'étape 1 montre le **nouveau** sha dans l'image de `todo-api`.
3. L'API répond :
   ```bash
   curl -s localhost:3000/health
   ```
   doit renvoyer `{"status":"ok",...}`.
4. Le panneau **Disponibilité** de Grafana (`localhost:3001`, dashboard « Todo API - Golden Signals ») est vert (`up = 1`).

## 3. Déploiement manuel (si la pipeline est indisponible)

```bash
cd ~/Developer/devops_ipssi/projet-docker
scp -i deploy_key -P 2222 -r compose.yml monitoring root@localhost:/srv/todo/
ssh -i deploy_key -p 2222 root@localhost "cd /srv/todo && TAG=<sha du commit voulu> docker compose up -d"
```

Le `<sha du commit voulu>` : un tag existant de `nabysarr16/todo-api` sur Docker Hub
(le sha complet d'un commit de `main` dont la pipeline a été verte).

**Vérification** : identique à l'étape 2 (points 2, 3, 4).

## 4. RETOUR ARRIÈRE (rollback)

**La commande** (remplacer par le sha noté à l'étape 1) :

```bash
ssh -i deploy_key -p 2222 root@localhost "cd /srv/todo && TAG=<sha précédent> docker compose up -d"
```

**Vérification** : `curl -s localhost:3000/api/tasks` répond `200` en moins de 30 s
(mesuré : rétablissement en ~12 s). L'étape 1 montre l'ancien sha.

**Qui décide, et sur quel critère** — aucune ligne ne laisse place à l'interprétation :

| Signal observé | Action |
|---|---|
| Taux d'erreur 5xx > 5 % pendant plus de 5 min après un déploiement (panneau Erreurs) | **Rollback immédiat**, sans validation supplémentaire — la personne qui a déployé décide seule |
| Latence p95 en hausse mais service qui répond | Surveiller 10 minutes de plus, prévenir le binôme ; rollback seulement si ça ne redescend pas |
| Doute, signal ambigu, rien de franchement rouge | Ne rien toucher, demander une validation humaine (binôme/formateur) |

**Cas limite connu** : un rollback vers un tag inexistant échoue avec
`manifest unknown` et **ne casse rien** — la version en place continue de tourner.
Corriger le sha et recommencer.

## 5. Pannes connues et leur signature sur le tableau de bord

> **Réflexe appris en passation** : sans trafic utilisateur, le panneau Erreurs
> peut rester plat même quand tout est cassé. Le diagnostic le plus rapide,
> valable dans tous les cas, c'est le contraste de deux curls :
> ```bash
> curl -s -m 3 -w " [%{http_code}]" localhost:3000/health
> curl -s -m 3 -w " [%{http_code}]" localhost:3000/api/tasks
> ```
> `/health` OK + `/api/tasks` en 503 → problème côté base (ligne 2).
> Les deux injoignables → problème côté API (ligne 1).
> Les deux OK alors qu'une panne est signalée → penser à la saturation : sur une
> machine multi-cœurs, des processus parasites ne ralentissent pas forcément une
> petite API. Le signal fiable, c'est `docker ps` (conteneurs inconnus) et
> `docker stats --no-stream` (CPU à 100 %), pas la latence.

| Signature Grafana | Diagnostic probable | Geste |
|---|---|---|
| **Disponibilité à 0**, trafic plat | le conteneur `todo-api` est arrêté ou mort | `ssh -i deploy_key -p 2222 root@localhost "docker start todo-api"` puis vérif `curl localhost:3000/health` |
| **Disponibilité à 1 MAIS erreurs 5xx qui explosent** | la base est coupée ou injoignable (l'API répond `503 base de données injoignable`) | `ssh -i deploy_key -p 2222 root@localhost "docker start todo-db"` — si déjà `Up` : vérifier le réseau `docker network inspect todo_default` doit lister `todo-api` ET `todo-db` ; sinon `cd /srv/todo && TAG=<sha courant> docker compose up -d` remet tout d'équerre |
| API qui répond mais **données vides/bizarres** | conteneur relancé sans sa config (`.env` non lu) | `cd /srv/todo && TAG=<sha courant> docker compose up -d` (recrée avec la bonne config) |
| Machine qui **rame**, tout est lent | processus parasites qui saturent le CPU | `ssh ... "docker ps"` → repérer les conteneurs inconnus (ex. `hog-*`), `docker rm -f <noms>` |
| Job `deploy` bloqué en **Queued** sans erreur | le runner self-hosted est arrêté | sur le poste : `cd ~/Developer/devops_ipssi/actions-runner && ./run.sh` et laisser la fenêtre ouverte |
| `port is already allocated` au `compose up` | un autre conteneur occupe le port 3000 côté machine cible | `ssh ... "docker ps"` → identifier l'occupant, l'arrêter s'il est illégitime, relancer le `compose up` |

## 6. Durée attendue et fenêtre

- Déploiement par pipeline : **2 à 4 min** (au-delà de 10 min, quelque chose ne va pas : regarder les logs du job).
- Rollback : **< 30 s** une fois la commande lancée.
- Coupure visible pendant un déploiement : quelques secondes (stratégie *recreate*) — acceptable à toute heure sur cette maquette.

## 7. Contacts et escalade

1. Le binôme de passation (à côté, ou en visio partagée).
2. Le formateur, si le binôme sèche à deux.
3. On n'improvise pas de troisième option à 3h du matin : si 1 et 2 sont injoignables, rollback (section 4) et on attend.
