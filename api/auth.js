const { createAuthHandler } = require('./_lib.js');
module.exports = createAuthHandler({ passwordHash: process.env.QWERTY_PASSWORD_HASH, secret: process.env.QWERTY_SESSION_SECRET || process.env.DATABASE_URL || 'qwerty-local-session' });
