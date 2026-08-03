// Transforme toute erreur en réponse JSON propre,
// jamais un stacktrace brut envoyé au client.
module.exports = (err, req, res, next) => {
  console.error(err.message);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'corps JSON malformé' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'corps de requête trop volumineux' });
  }
  const status = err.status || 500;
  const message = status === 500 ? 'Erreur interne du serveur' : err.message;
  res.status(status).json({ error: message });
};
