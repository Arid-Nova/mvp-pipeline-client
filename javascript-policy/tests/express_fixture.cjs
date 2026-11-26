'use strict';
// Trusted test application. Never imports or executes analyzed project source.
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const app = express();
const secret = crypto.randomBytes(32);
let writes = 0;
app.use(express.json());
app.get('/__state', (_req, res) => res.json({ writes }));
app.post('/record/:id', (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), secret);
    next();
  } catch {
    return res.status(401).json({ denied: true });
  }
}, (req, res) => {
  if (req.user.role !== 1 && req.user.id !== req.params.id) return res.status(403).json({ denied: true });
  writes += 1;
  return res.status(200).json({ ok: true });
});
// Deliberately faulty fixture demonstrates HTTP 403 alone cannot prove safety.
app.post('/bad-record/:id', (_req, res) => {
  writes += 1;
  return res.status(403).json({ denied: true });
});
const server = app.listen(0, '127.0.0.1', () => {
  const tokens = {};
  for (const role of [1, 2, 3, 'OTHER']) {
    tokens[JSON.stringify(role)] = {
      valid: jwt.sign({ id: 'self', role }, secret, { expiresIn: 300 }),
      expired: jwt.sign({ id: 'self', role }, secret, { expiresIn: -1 }),
      invalid: jwt.sign({ id: 'self', role }, crypto.randomBytes(32)),
      missing: null,
    };
  }
  process.stdout.write(JSON.stringify({ baseUrl: `http://127.0.0.1:${server.address().port}`, tokens }) + '\n');
});
process.on('SIGTERM', () => server.close());
