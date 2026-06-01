import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { product_name, quantity, source_warehouse_name, destination_warehouse_name, requested_by, reason } = body;

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (token && chatId) {
      const msg = [
        '🔄 *Transfer Requested*',
        `Product: ${product_name || 'N/A'}`,
        `Qty: ${quantity}`,
        `From: ${source_warehouse_name || '—'} → ${destination_warehouse_name || '—'}`,
        requested_by ? `By: ${requested_by}` : '',
        reason ? `Reason: ${reason}` : '',
      ].filter(Boolean).join('\n');

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('notify-transfer-requested error:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
