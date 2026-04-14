// ================================================================
// SEA Schnelle Hilfe — Cloudflare Worker (Backend Proxy)
//
// Deploy this at: https://workers.cloudflare.com
//
// Environment variables to set in the Cloudflare dashboard:
//   TELEGRAM_TOKEN   — your bot token (never expose in frontend!)
//   TELEGRAM_CHAT_ID — the group chat ID of the SEA strategists
//   ALLOWED_ORIGINS  — comma-separated list of allowed origins
//
// KV Namespace:
//   Bind a KV namespace called "MESSAGES" to store incoming replies
//   from the Telegram webhook and serve them to the polling client.
// ================================================================

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS — only allow configured origins
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || '*';

    const corsHeaders = {
      'Access-Control-Allow-Origin':  corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ----------------------------------------------------------------
    // POST /send
    // Receives a message from the customer app and forwards it to
    // the Telegram group, tagged with the customer's CID.
    // ----------------------------------------------------------------
    if (url.pathname === '/send' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400, corsHeaders);
      }

      const { cid, message, timestamp } = body;
      if (!cid || !message) {
        return json({ error: 'Missing cid or message' }, 400, corsHeaders);
      }

      // Format the Telegram message with HTML
      const telegramText = [
        `<b>🚨 SEA Schnelle Hilfe</b>`,
        `<b>Kunde (CID):</b> <code>${escapeHtml(cid)}</code>`,
        `<b>Zeit:</b> ${new Date(timestamp || Date.now()).toLocaleString('de-DE')}`,
        ``,
        escapeHtml(message),
      ].join('\n');

      const tgRes = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            chat_id:    env.TELEGRAM_CHAT_ID,
            text:       telegramText,
            parse_mode: 'HTML',
          }),
        }
      );

      if (!tgRes.ok) {
        const err = await tgRes.text();
        return json({ error: 'Telegram error', detail: err }, 502, corsHeaders);
      }

      return json({ ok: true }, 200, corsHeaders);
    }

    // ----------------------------------------------------------------
    // GET /messages?cid=XXXX-XXXX-XX&since=<timestamp>
    // Returns any replies stored in KV for the given CID since `since`.
    // The Telegram webhook (POST /webhook) writes replies into KV.
    // ----------------------------------------------------------------
    if (url.pathname === '/messages' && request.method === 'GET') {
      const cid   = url.searchParams.get('cid');
      const since = parseInt(url.searchParams.get('since') || '0', 10);

      if (!cid) return json({ error: 'Missing cid' }, 400, corsHeaders);

      const key      = `replies:${cid}`;
      const raw      = await env.MESSAGES.get(key);
      const allMsgs  = raw ? JSON.parse(raw) : [];
      const filtered = allMsgs.filter(m => m.ts > since);

      return json({ messages: filtered }, 200, corsHeaders);
    }

    // ----------------------------------------------------------------
    // POST /webhook
    // Telegram webhook endpoint — receives replies from the group chat.
    // The bot listens for replies to forwarded messages (by thread/CID tag).
    //
    // Setup: in Telegram BotFather, set the webhook to:
    //   https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev/webhook
    // ----------------------------------------------------------------
    if (url.pathname === '/webhook' && request.method === 'POST') {
      let update;
      try {
        update = await request.json();
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      const msg = update.message || update.channel_post;
      if (msg && msg.text && msg.reply_to_message) {
        // Extract CID from the original (forwarded) message text
        const originalText = msg.reply_to_message.text || '';
        const cidMatch     = originalText.match(/CID\):\s*(\d{4}-\d{4}-\d{2})/);

        if (cidMatch) {
          const cid   = cidMatch[1];
          const key   = `replies:${cid}`;
          const raw   = await env.MESSAGES.get(key);
          const msgs  = raw ? JSON.parse(raw) : [];

          msgs.push({ text: msg.text, ts: Date.now() });

          // Keep only the last 50 messages per CID
          const trimmed = msgs.slice(-50);
          await env.MESSAGES.put(key, JSON.stringify(trimmed), {
            expirationTtl: 60 * 60 * 24 * 7, // 7 days
          });
        }
      }

      return new Response('OK', { status: 200 });
    }

    return json({ error: 'Not found' }, 404, corsHeaders);
  },
};

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
