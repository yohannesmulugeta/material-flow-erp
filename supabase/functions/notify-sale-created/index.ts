import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { invoice_number, customer_name, total, warehouse_name, sale_type, created_by_name } = body;

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (token && chatId) {
      const msg = [
        '🛒 *New Sale Created*',
        `Invoice: \`${invoice_number || 'N/A'}\``,
        `Customer: ${customer_name || 'Walk-in'}`,
        `Warehouse: ${warehouse_name || '—'}`,
        `Type: ${sale_type || '—'}`,
        `Total: ETB ${Number(total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        created_by_name ? `By: ${created_by_name}` : '',
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
    console.error('notify-sale-created error:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
