// ================================================================
// GET /api/messages?cid=XXXX-XXXX-XX&since=<timestamp>
// Returns strategist replies stored in Upstash Redis for a given CID.
// The frontend polls this every 8 seconds.
//
// Required env vars:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
// ================================================================

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).end();

  const { cid, since = '0' } = req.query;
  if (!cid) return res.status(400).json({ error: 'Missing cid' });

  const sinceTs = parseInt(since, 10);

  try {
    const result = await redisCommand('LRANGE', `replies:${cid}`, 0, -1);
    const all    = (result.result || []).map(s => {
      try { return JSON.parse(s); } catch { return null; }
    }).filter(Boolean);

    const messages = all.filter(m => m.ts > sinceTs);
    return res.status(200).json({ messages });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

async function redisCommand(...args) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return { result: [] };

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return res.json();
}
