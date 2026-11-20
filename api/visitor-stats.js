const allowedOrigins = new Set(['https://atoz.xn--zk5biyyw.com', 'https://frachalab.vercel.app']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({error: 'method_not_allowed'});
  }
  if (!allowedOrigins.has(request.headers.origin)) {
    return response.status(403).json({error: 'origin_not_allowed'});
  }
  const session = request.body?.session;
  if (typeof session !== 'string' || !uuid.test(session)) {
    return response.status(400).json({error: 'invalid_session'});
  }
  const {SANGA_SUPABASE_URL, SANGA_SUPABASE_PUBLISHABLE_KEY, SANGA_VISITOR_SECRET} = process.env;
  if (!SANGA_SUPABASE_URL || !SANGA_SUPABASE_PUBLISHABLE_KEY || !SANGA_VISITOR_SECRET) {
    return response.status(503).json({error: 'stats_unavailable'});
  }
  try {
    const result = await fetch(new URL('/rest/v1/rpc/sanga_record_visit', SANGA_SUPABASE_URL), {
      method: 'POST',
      headers: {apikey: SANGA_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({p_session: session, p_secret: SANGA_VISITOR_SECRET}),
      signal: AbortSignal.timeout(4500),
    });
    if (result.ok) return response.status(200).json(await result.json());
    console.error('Visitor statistics RPC status:', result.status);
  } catch (error) {
    console.error('Visitor statistics RPC failed:', error.name);
  }
  return response.status(503).json({error: 'stats_unavailable'});
};
