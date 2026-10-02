const { createStateHandler, liveDb } = require('./_lib.js');
module.exports = createStateHandler({ db: liveDb(), secret: process.env.QWERTY_SESSION_SECRET || process.env.DATABASE_URL || 'qwerty-local-session' });
