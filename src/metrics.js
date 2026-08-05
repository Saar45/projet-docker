const client = require('prom-client');

// Un Registry rassemble toutes les métriques de l'application, et collecte
// aussi les métriques standard (mémoire, CPU, event loop) sans rien coder.
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Counter : compte les requêtes, réparties par méthode, route et code de
// statut. Trois labels suffisent à répondre à "quelle route casse".
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requetes HTTP servies',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// Histogram : la durée de chaque requête, pour pouvoir calculer un p95.
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// La métrique métier, celle que personne d'autre que nous ne peut deviner.
const tasksCreatedTotal = new client.Counter({
  name: 'tasks_created_total',
  help: 'Nombre de taches creees depuis le demarrage',
  registers: [register],
});

// Middleware exécuté sur chaque requête : chrono au départ, labels à l'arrivée.
function metricsMiddleware(req, res, next) {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // req.route.path capture la route déclarée ("/api/tasks/:id"), jamais
    // l'URL réelle : l'identifiant d'une tâche ne doit JAMAIS devenir un
    // label, sinon chaque tâche crée sa propre série (piège de cardinalité).
    // Une URL qui ne correspond à aucune route est comptée quand même,
    // sous un label unique et borné.
    const route = req.route
      ? (req.baseUrl + req.route.path).replace(/\/$/, '') || '/'
      : 'non_routee';
    const labels = { method: req.method, route, status: res.statusCode };
    httpRequestsTotal.inc(labels);
    stopTimer(labels);
  });
  next();
}

module.exports = { register, metricsMiddleware, tasksCreatedTotal };
