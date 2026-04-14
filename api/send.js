// ================================================================
// POST /api/send
// Receives a customer message and forwards it to the Telegram group.
//
// Required env vars in Vercel dashboard:
//   TELEGRAM_TOKEN   — Bot token from BotFather
//   TELEGRAM_CHAT_ID — Group chat ID (e.g. -1001234567890)
// ================================================================

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cid, message, timestamp } = req.body || {};

  if (!cid || !message) {
    return res.status(400).json({ error: 'Missing cid or message' });
  }

  const token  = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Telegram not configured. Set TELEGRAM_TOKEN and TELEGRAM_CHAT_ID in Vercel.' });
  }

  const time = new Date(timestamp || Date.now()).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
  });

  const text = [
    `🚨 <b>SEA Schnelle Hilfe — Neue Nachricht</b>`,
    ``,
    `<b>Kunde (CID):</b> <code>${escHtml(cid)}</code>`,
    `<b>Zeit:</b> ${time}`,
    ``,
    `<b>Nachricht:</b>`,
    escHtml(message),
  ].join('\n');

  try {
    const tgRes = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      }
    );

    if (!tgRes.ok) {
      const detail = await tgRes.text();
      console.error('Telegram error:', detail);
      return res.status(502).json({ error: 'Telegram error', detail });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
