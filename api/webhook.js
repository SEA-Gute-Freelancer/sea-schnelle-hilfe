// ================================================================
// POST /api/webhook
// Telegram webhook — receives replies from the strategist group.
// Stores replies in Upstash Redis so the customer app can poll them.
//
// Required env vars:
//   UPSTASH_REDIS_REST_URL   — from upstash.com (free tier)
//   UPSTASH_REDIS_REST_TOKEN — from upstash.com (free tier)
//
// Setup: set your Telegram webhook once via:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-vercel-domain>/api/webhook"
// ================================================================

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const update = req.body;
  const msg    = update?.message || update?.channel_post;

  // Only process replies to forwarded messages
  if (msg?.text && msg?.reply_to_message) {
    const originalText = msg.reply_to_message.text || '';

    // Extract CID from the tagged original message
    const cidMatch = originalText.match(/CID\):\s*(\d{4}-\d{4}-\d{2})/);

    if (cidMatch) {
      const cid   = cidMatch[1];
      const reply = { text: msg.text, ts: Date.now() };

      await redisCommand('RPUSH', `replies:${cid}`, JSON.stringify(reply));
      await redisCommand('EXPIRE', `replies:${cid}`, 60 * 60 * 24 * 7); // 7 days
    }
  }

  return res.status(200).json({ ok: true });
};

// ----------------------------------------------------------------
// Upstash Redis REST helper (no package needed)
// ----------------------------------------------------------------
async function redisCommand(...args) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return { result: null };

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
