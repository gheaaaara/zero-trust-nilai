const Database = require('better-sqlite3');
const { DB_PATH } = require('./config');

const db = new Database(DB_PATH, { fileMustExist: true });
db.pragma('busy_timeout = 5000'); // tiga proses berbagi satu file
module.exports = db;
