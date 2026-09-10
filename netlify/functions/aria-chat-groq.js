// Test version: Groq + Llama 3.3 as the chat brain, Grok still handles voice (TTS)
export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { message } = JSON.parse(event.body);

    // Step 1: Get Llama's text reply via Groq
    const chatResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
           content: `Eres Ara, la asistente de compras de Aria (ariashop.pe), una plataforma que permite a peruanos comprar en tiendas de EE.UU. como Target, Walmart, Best Buy, Costco, Nordstrom, Victoria's Secret, Bath & Body Works, Coach, Michael Kors y Kate Spade, con envío consolidado desde Miami hasta Perú. Estas son las ÚNICAS tiendas disponibles en Aria — nunca menciones Amazon, Nike.com, Foot Locker, ni ninguna otra tienda que no esté en esta lista. Hablas español peruano de forma cálida, natural y concisa, como una amiga que sabe de compras. Responde en 2-3 oraciones como máximo. Si el usuario habla en inglés, responde en inglés.`,
          },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 250,
      }),
    });

    const chatData = await chatResponse.json();
    const reply = chatData.choices[0].message.content;

    // Step 2: Convert reply to speech using Grok's TTS (still the cheaper voice option)
    const ttsResponse = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voice_id: "ara",
        text: reply,
        language: "es",
      }),
    });

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply, audio: audioBase64 }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
