import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { type, reference_label, requested_by, notes } = body;

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (token && chatId) {
      const typeLabel: Record<string, string> = {
        transfer: '🔄 Transfer',
        return: '↩️ Return',
        damage: '⚠️ Damage',
        stock_adjustment: '📦 Stock Adjustment',
        payment_edit: '💰 Payment Edit',
        payment_delete: '🗑️ Payment Delete',
        record_delete: '🗑️ Record Delete',
      };

      const msg = [
        `${typeLabel[type] || '📋'} *Approval Needed*`,
        `Record: ${reference_label || type}`,
        requested_by ? `Requested by: ${requested_by}` : '',
        notes ? `Notes: ${notes}` : '',
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
    console.error('notify-approval-needed error:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
