import OpenAI from "openai";

class OpenAiAdapter {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.modelName = "gpt-4o-mini";
  }

  // TEXT CHAT GENERATION
  async generateResponse(systemPrompt, userText, context = {}) {
    try {
      // Optimasi Token: Jika history chat terlalu panjang, potong di logic flow (bukan disini).
      const contextString = JSON.stringify(context);

      const messages = [
        {
          role: "system",
          content: `${systemPrompt}\n\nIMPORTANT: You are a JSON generator. You must output VALID JSON only.`,
        },
        {
          role: "user",
          content: `CONTEXT: ${contextString}\nUSER SAYS: "${userText}"\n\nRespond in JSON format: { "intent": "STRING", "reply": "STRING", "data": OBJECT }`,
        },
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.modelName,
        messages,
        temperature: 0.3, // Sedikit kreatif tapi tetap patuh aturan
        response_format: { type: "json_object" },
      });

      const rawContent = completion.choices[0].message.content;
      return JSON.parse(rawContent);
    } catch (error) {
      console.error("[OpenAI] Text Error:", error.message);
      return {
        intent: "CHITCHAT",
        reply: "Maaf, sepertinya sistem sedang sibuk. Boleh ulangi pesanannya Kak? 🙏",
        data: {},
      };
    }
  }

  // VISION / IMAGE PROCESSING (SCAN STRUK)
  async processImage(base64Data, mimeType, prompt) {
    try {
      console.log("[OpenAI] Processing Image Struk...");

      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${prompt}. RETURN JSON ONLY: { "total": number }. Contoh: { "total": 50000 }. Jika tidak terbaca/gagal, return { "total": 0 }.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
                detail: "low", // (Fixed ~85 tokens)
              },
            },
          ],
        },
      ];

      const response = await this.openai.chat.completions.create({
        model: this.modelName,
        messages,
        max_tokens: 100,
        temperature: 0.1,
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices[0].message.content;
      console.log("[OpenAI] Raw Vision:", rawContent);

      const resultObj = JSON.parse(rawContent);

      // Normalisasi output (kadang AI return total_amount, kadang total)
      const finalAmount = resultObj.total || resultObj.total_amount || resultObj.amount || 0;

      return parseInt(finalAmount);
    } catch (error) {
      console.error("[OpenAI Vision] Error:", error.message);
      return 0;
    }
  }
}

export default OpenAiAdapter;
