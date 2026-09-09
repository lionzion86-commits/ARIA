// Secure middleman between ariashop.pe and Grok
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

    // Step 1: Get Grok's text reply
    const chatResponse = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4",
        messages: [
          {
            role: "system",
            content:
              "You are Aria, a helpful shopping assistant for ariashop.pe, a cross-border shopping platform letting Peruvians buy from US retailers like Target, Walmart, and Best Buy with delivery to Peru. Keep replies short and conversational, in Spanish unless the user writes in English.",
          },
          { role: "user", content: message },
        ],
      }),
    });

    const chatData = await chatResponse.json();
    const replyText = chatData.choices[0].message.content;

    // Step 2: Convert that reply to speech using Grok's Ara voice
    const speechResponse = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: replyText,
        voice_id: "ara",
        language: "es",
      }),
    });

    const audioBuffer = await speechResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reply: replyText,
        audio: audioBase64,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
