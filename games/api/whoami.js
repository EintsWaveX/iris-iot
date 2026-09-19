// GET /api/whoami?op=<token>   (or header X-Operator-Token: <token>)
//
// Tells the client whether the token it's holding is the operator token, so
// the UI can decide whether to show operator controls. This never grants
// write access itself — /api/write re-checks the token independently — it
// only toggles what the UI renders.
//
// Contract: 200 {"operator":true|false}   -- always this shape, always 200
// for a well-formed GET. The token is never echoed back in the response.

import crypto from 'node:crypto';

function constantTimeEquals(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  // Guard the length check FIRST -- timingSafeEqual throws on mismatched
  // buffer lengths, and it's cheap for an attacker to probe token length
  // via a thrown-error side channel if we let that exception escape.
  if (bufA.length !== bufB.length) return false;
  if (bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    res.setHeader('Cache-Control', 'no-store');

    const headerToken = req.headers ? req.headers['x-operator-token'] : undefined;
    const queryToken = req.query ? req.query.op : undefined;
    const token = headerToken || queryToken || '';

    const expected = process.env.OPERATOR_TOKEN || '';
    const operator = expected !== '' && constantTimeEquals(token, expected);

    return res.status(200).json({ operator: Boolean(operator) });
  } catch (err) {
    console.error('[api/whoami] unexpected error:', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ operator: false });
  }
}
