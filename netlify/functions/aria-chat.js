// netlify/functions/aria-chat.js
//
// This is the secure "middleman" between ariashop.pe and Grok.
// It holds the GROK_API_KEY (stored in Netlify's Environment Variables,
// never in the front-end code) and does two things per request:
//   1. Sends the customer's message to Grok's chat model and gets a text reply.
//   2. Sends that text reply to Grok's voice model (Ara) and gets audio back.
// It returns both the text and the audio to the browser in one response.

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GROK_API_KEY = process.env.GROK_API_KEY;
  if (!GROK_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falta configurar GROK_API_KEY en Netlify.' })
    };
  }

  let message, history;
  try {
    const body = JSON.parse(event.body || '{}');
    message = body.message;
    history = Array.isArray(body.history) ? body.history : [];
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido en la solicitud.' }) };
  }

  if (!message || typeof message !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el mensaje del usuario.' }) };
  }

  const systemPrompt =
    'Eres Aria, la asistente de compras de Aria (ariashop.pe), una plataforma que permite a ' +
    'los peruanos comprar en tiendas de Estados Unidos (Target, Walmart, Best Buy, Victoria\'s ' +
    'Secret, Bath & Body Works, Costco, entre otras) con envío consolidado desde Miami hacia Perú. ' +
    'Responde siempre en español, de forma cálida, breve, cercana y útil, como una asesora de ' +
    'confianza. Ayuda a encontrar productos, comparar precios entre tiendas, y explicar el ' +
    'proceso de compra, envío y aduanas cuando sea relevante. Cuando tenga sentido, sugiere ' +
    'productos relacionados o complementarios de forma natural, sin sonar forzada.';

  try {
    // 1) Get Aria's text reply from Grok's chat model
    const chatResponse = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-4.6',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 400
      })
    });

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Error al contactar a Grok (chat).', detail: errText })
      };
    }

    const chatData = await chatResponse.json();
    const replyText =
      chatData?.choices?.[0]?.message?.content?.trim() ||
      'Lo siento, no pude responder eso. ¿Puedes intentar de nuevo?';

    // 2) Turn that reply into spoken audio using the "Ara" voice
    let audioBase64 = null;
    try {
      const ttsResponse = await fetch('https://api.x.ai/v1/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-tts',
          input: replyText,
          voice: 'ara',
          response_format: 'mp3'
        })
      });

      if (ttsResponse.ok) {
        const audioBuffer = await ttsResponse.arrayBuffer();
        audioBase64 = Buffer.from(audioBuffer).toString('base64');
      }
      // If TTS fails, we still return the text reply below —
      // the widget can just show text that turn instead of failing entirely.
    } catch (ttsErr) {
      // swallow TTS errors, text reply still goes through
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: replyText, audio: audioBase64 })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
