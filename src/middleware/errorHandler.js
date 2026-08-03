// Transforme toute erreur en réponse JSON propre,
// jamais un stacktrace brut envoyé au client.
module.exports = (err, req, res, next) => {
  console.error(err.message);
  const status = err.status || 500;
  const message = status === 500 ? 'Erreur interne du serveur' : err.message;
  res.status(status).json({ error: message });
};
