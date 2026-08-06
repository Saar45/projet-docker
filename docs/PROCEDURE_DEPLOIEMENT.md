# Procédure de déploiement — Todo API (cible : cluster Kubernetes)

> Ce document est un **runbook** : il dit quoi taper, dans quel ordre, et comment
> vérifier que ça a marché. Il se suit sous stress, sans réfléchir.
> Pour comprendre l'architecture, voir le README — pas ici.
>
> **Historique** : jusqu'au J3, la cible était une machine unique (`vm-prod`, SSH,
> docker compose). Cette version décrit la cible actuelle : le cluster
> `todo-cluster`. L'ancienne machine est en pause (`docker start vm-prod` la
> ressusciterait), plus rien ne se déploie dessus.

## 0. Prérequis et accès (à vérifier AVANT de commencer)

| Quoi | Valeur |
|---|---|
| Cible | cluster k3d `todo-cluster` (tourne sur le poste, dans Docker) |
| Outil | `kubectl`, contexte **`k3d-todo-cluster`**, namespace **`todo`** |
| Entrée du trafic | `http://todo.localhost:8081` (loadbalancer k3d → Traefik → Ingress) — 8081, pas 8080 : un nginx local occupe le 8080 sur ce poste |
| Image | Docker Hub `nabysarr16/todo-api:<sha du commit>` |
| Pipeline | GitHub → `Saar45/projet-docker` → onglet Actions (runner self-hosted en service launchd) |
| Manifestes | `k8s/` dans le dépôt — **la seule source de vérité** |

Test d'accès (30 secondes, à faire en premier) :

```bash
kubectl --context k3d-todo-cluster get nodes
```

**Vérification** : une ligne `k3d-todo-cluster-server-0   Ready`. Sinon, STOP :
Docker Desktop tourne-t-il ? Puis `k3d cluster list` — si le cluster est arrêté,
`k3d cluster start todo-cluster`, retester. Toujours préciser `--context
k3d-todo-cluster` (ou vérifier `kubectl config current-context`) : un kubectl
pointé sur le mauvais cluster exécute des ordres parfaitement valides au mauvais
endroit.

## 1. Connaître la version qui tourne (avant de toucher à quoi que ce soit)

```bash
kubectl get deployment todo-api -n todo -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
kubectl rollout history deployment/todo-api -n todo | tail -5
```

**Vérification** : l'image affiche `nabysarr16/todo-api:<sha>`. **Noter ce sha.**
(Le retour arrière n'en a plus besoin — `rollout undo` a sa propre mémoire —
mais un incident se raconte toujours mieux avec la version de départ.)

## 2. Déploiement normal (le cas de tous les jours)

Le déploiement normal, c'est un push sur `main`. Rien d'autre.

```bash
git push origin main
```

**Vérification étape par étape** :

1. Onglet Actions : `test`, `test-integration`, `build`, `deploy` verts.
   Durée normale : **2 à 4 minutes**. Le job `deploy` est *gaté* par
   `kubectl rollout status --timeout=180s` : s'il est rouge, le rollout n'a pas
   convergé et **les anciens pods servent toujours** — la prod n'est pas cassée,
   elle est juste restée à l'ancienne version.
2. L'étape 1 montre le **nouveau** sha dans l'image du Deployment.
3. L'API répond :
   ```bash
   curl -s -H "Host: todo.localhost" http://localhost:8081/health
   ```
   doit renvoyer `{"status":"ok",...}`.
4. `kubectl get pods -n todo -l app=todo-api` : trois pods `1/1 Running`.

## 3. Déploiement manuel d'urgence (si la pipeline elle-même est en panne)

```bash
kubectl set image deployment/todo-api todo-api=nabysarr16/todo-api:<sha voulu> -n todo
kubectl rollout status deployment/todo-api -n todo --timeout=180s
```

Le `<sha voulu>` : un tag existant sur Docker Hub (sha complet d'un commit de
`main` à pipeline verte).

**Vérification** : `rollout status` rend la main sur `successfully rolled out`,
puis points 2-4 de la section 2. S'il ne rend pas la main : section 5, pannes 3/4/5.

## 4. RETOUR ARRIÈRE (rollback)

**La commande** — plus de tag à chercher, l'historique s'en souvient :

```bash
kubectl rollout undo deployment/todo-api -n todo
kubectl rollout status deployment/todo-api -n todo --timeout=180s
```

(Pour viser une révision précise : `kubectl rollout history deployment/todo-api -n todo`
puis `kubectl rollout undo deployment/todo-api -n todo --to-revision=N`.)

**Vérification** : premier `200` sur `/api/tasks` en ~10 s (mesuré : 9,1 s) ;
convergence complète annoncée par `rollout status` (~20 s — pendant l'écart, la
flotte est mixte, quelques réponses de l'ancienne version peuvent subsister).

**⚠️ Ne jamais dégainer `undo` sans avoir constaté la panne ET vérifié
`rollout status`** : un undo lancé pendant un rollout en cours permute les deux
dernières révisions et peut *réinstaller* la version cassée (vécu en phase 9).

**Qui décide, et sur quel critère** :

| Signal observé | Action |
|---|---|
| Taux d'erreur 5xx > 5 % pendant plus de 5 min après un déploiement | **Rollback immédiat**, sans validation — la personne qui a déployé décide seule |
| `rollout status` du job deploy en timeout (job rouge) | Rien à annuler côté service : les anciens pods servent. Diagnostiquer le pod cassé (section 5), corriger, re-pousser |
| Latence en hausse mais service qui répond | Surveiller 10 min, prévenir le binôme ; rollback si ça ne redescend pas |
| Doute, signal ambigu | Ne rien toucher, demander une validation humaine |

## 5. Pannes connues et leur signature

> **Réflexe universel, dans l'ordre** : `kubectl get pods -n todo` →
> `kubectl describe pod <nom> -n todo` (section Events, en bas) →
> `kubectl logs <pod> -n todo [--previous]`. `describe` raconte ce qui empêche
> un pod de démarrer, `logs --previous` ce qui l'a fait tomber une fois démarré.
>
> **Et jamais une seule photo** : après un incident signalé, regarder **deux
> fois à 30 s d'écart** (ou `kubectl get pods -n todo -w` quelques instants).
> Un rollout naissant est invisible dans la première seconde — un `get pods`
> unique tiré trop tôt fait conclure « rien à signaler » sur une panne bien
> réelle (erreur commise et corrigée pendant la mise à l'épreuve de ce runbook).

| Signature | Diagnostic | Remède |
|---|---|---|
| Un pod a disparu / vient d'être remplacé | boucle de réconciliation | **rien à faire** — il est déjà revenu (~7 s). La ligne « relancer le service » n'existe plus : si un humain l'a remarqué, c'est déjà réparé |
| Nouveau pod `ImagePullBackOff`, anciens `Running`, rollout bloqué | tag d'image inexistant ou faute de frappe | `kubectl rollout undo deployment/todo-api -n todo` |
| Nouveau pod `CrashLoopBackOff`, logs : `La variable d'environnement X doit être définie` | clé manquante dans `todo-secret`/`todo-config` | récupérer la valeur perdue depuis le pod Postgres vivant : `kubectl exec -n todo deploy/todo-db -- printenv POSTGRES_PASSWORD`, puis re-patcher le Secret et `kubectl rollout restart deployment/todo-api -n todo` |
| Nouveau pod `CrashLoopBackOff`, `describe` : `Last State: OOMKilled, Exit Code: 137` | `limits.memory` trop basse | restaurer le manifeste — **attention** : un champ posé par `kubectl patch` survit à `kubectl apply` (merge 3-way) ; utiliser `kubectl replace -f k8s/todo-api-deployment.yaml` |
| Pods `Running 1/1` mais 100 % d'échecs côté client | Service sans endpoints (selector qui ne matche aucun label) | `kubectl apply -f` du manifeste du Service — la panne invisible au `get pods` |
| Pods `Running 1/1 Ready`, `/health` ok, mais `/api/tasks` en 503 | la base est tombée — **les sondes mentent** : `/health` ne teste que « le serveur écoute », jamais la base | `kubectl get pods -n todo -l app=todo-db`, remonter la base (`kubectl scale deployment/todo-db -n todo --replicas=1` si elle a été scalée à 0) |
| Pod `Pending` qui ne démarre jamais | aucun node ne peut l'accueillir | `describe pod`, events : `Insufficient memory/cpu` → baisser les `requests` ou libérer le node |
| Job `deploy` en `Queued` sans erreur | runner self-hosted arrêté | `cd ~/Developer/devops_ipssi/actions-runner && ./svc.sh status` — si arrêté, `./svc.sh start` |
| `kill` d'un process dans un conteneur sans effet | node est PID 1 sans handler : le noyau ignore les signaux internes | ce n'est pas une panne à réparer, c'est un comportement à connaître (la vraie mort vient d'un crash ou d'un OOM) |

## 6. Durée attendue

- Déploiement par pipeline : **2 à 4 min** au total ; le rollout lui-même ~20 s (`maxSurge: 1 / maxUnavailable: 0` : zéro requête perdue, mesuré sous charge — 0 échec sur 214 requêtes).
- Rollback : **premier 200 en ~10 s**, convergence complète ~20 s.
- Fenêtre de coupure : **aucune** pour un déploiement qui se passe bien ; la seule durée à provisionner est celle d'un rollback éventuel.

## 7. Contacts et escalade

1. Le binôme de passation (à côté, ou en visio partagée).
2. Le formateur, si le binôme sèche à deux.
3. Si 1 et 2 sont injoignables : rollback (section 4) et on attend. On n'improvise pas de troisième option à 3h du matin.
