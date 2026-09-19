// GET /api/config
//
// Tells the browser where the public Firebase Realtime Database lives so it
// can open a raw EventSource stream against RTDB's REST API directly. This
// endpoint is the ONLY thing the client calls through Vercel for reads —
// after this one call, all 25 phones stream `/state.json` straight from
// Firebase and never touch a Vercel function again.
//
// Contract:
//   200 {"ok":true,"databaseURL":"https://xxx.firebaseio.com"}
//   200 {"ok":false,"error":"not_configured"}   <- deliberately 200, not 5xx:
//        the client treats this as "run offline", and a 5xx would look like
//        an outage instead of "nobody set up Firebase yet".
//
// Never leaks a stack trace; logs unexpected errors server-side only.

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    res.setHeader('Cache-Control', 'no-store');

    const databaseURL = process.env.FIREBASE_DATABASE_URL;
    if (!databaseURL || String(databaseURL).trim() === '') {
      return res.status(200).json({ ok: false, error: 'not_configured' });
    }

    return res.status(200).json({ ok: true, databaseURL });
  } catch (err) {
    console.error('[api/config] unexpected error:', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: false, error: 'not_configured' });
  }
}
