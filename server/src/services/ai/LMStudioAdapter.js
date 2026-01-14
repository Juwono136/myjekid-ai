import axios from "axios";

class LMStudioAdapter {
  constructor(baseUrl, model) {
    this.baseUrl = baseUrl || process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1";
    this.model = model || process.env.LMSTUDIO_MODEL || "gemma-3-12b-it";
    this.apiKey = process.env.LMSTUDIO_API_KEY || "lm-studio";

    if (this.baseUrl.endsWith("/v0")) this.baseUrl = this.baseUrl.replace("/v0", "/v1");
  }

  // TEXT CHAT
  async generateResponse(systemPrompt, userText, context = {}) {
    try {
      const contextString = JSON.stringify(context, null, 2);

      // Gunakan content string biasa, jangan object array.
      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          // Gabungkan context dan pesan user jadi satu string
          content: `CONTEXT DATA:\n${contextString}\n\nUSER MESSAGE:\n"${userText}"\n\n(Respond ONLY in Valid JSON format)`,
        },
      ];

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          temperature: 0.1,
          stream: false,
        },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` } }
      );

      const rawContent = response.data.choices[0].message.content;
      return this.cleanAndParseJson(rawContent);
    } catch (error) {
      console.error("LMStudio Error:", error.response?.data || error.message);
      return {
        intent: "CHITCHAT",
        reply:
          "Maaf, sepertinya sistem aplikasi sedang mengalami gangguan. Mohon coba beberapa saat lagi 🙏",
        data: {},
      };
    }
  }

  // VISION OCR
  async processImage(base64Data, mimeType, prompt) {
    try {
      // Khusus Vision, baru kita pakai format array object
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
          ],
        },
      ];

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          temperature: 0.1,
          max_tokens: 300,
        },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` } }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error("LMStudio Vision Error:", error.message);
      return "0";
    }
  }

  cleanAndParseJson(text) {
    try {
      let clean = text.replace(/```json|```/g, "").trim();
      const first = clean.indexOf("{");
      const last = clean.lastIndexOf("}");
      if (first !== -1 && last !== -1) clean = clean.substring(first, last + 1);
      return JSON.parse(clean);
    } catch (e) {
      return { intent: "CHITCHAT", reply: text, data: {} };
    }
  }
}

export default LMStudioAdapter;
