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
  // Base de données injoignable : erreur exploitable côté client,
  // jamais un crash du process ni un timeout silencieux.
  const DB_DOWN_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '08001', '08006', '57P01', '57P02', '57P03'];
  if (DB_DOWN_CODES.includes(err.code) || /connection terminated|timeout exceeded/i.test(err.message || '')) {
    return res.status(503).json({ error: 'base de données injoignable' });
  }
  const status = err.status || 500;
  const message = status === 500 ? 'Erreur interne du serveur' : err.message;
  res.status(status).json({ error: message });
};
