require('dotenv').config();

const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 3000;

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error(`Impossible d'initialiser la base de données : ${err.message}`);
    process.exit(1);
  });
