import axios from "axios";

class LMStudioAdapter {
  constructor() {
    // Default config jika tidak ada di .env
    this.baseUrl = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v0";
    this.model = process.env.LMSTUDIO_MODEL || "gemma-3-12b-it";
    this.apiKey = process.env.LMSTUDIO_API_KEY || "lm-studio";
  }

  // TEXT CHAT (User Flow)
  async generateResponse(systemPrompt, userText, context = {}) {
    try {
      const contextString = JSON.stringify(context, null, 2);

      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `CONTEXT DATA:\n${contextString}\n\nUSER MESSAGE:\n"${userText}"\n\n(Respond ONLY in Valid JSON format)`,
        },
      ];

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          temperature: 0.1,
          max_tokens: 1000,
          stream: false,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      const rawContent = response.data.choices[0].message.content;
      return this.cleanAndParseJson(rawContent);
    } catch (error) {
      console.error("❌ LMStudio Chat Error:", error.response?.data || error.message);
      return {
        intent: "CHITCHAT",
        reply: "Maaf, sistem AI lokal sedang sibuk. Bisa diulangi pesannya?",
      };
    }
  }

  // IMAGE PROCESSING (Struk/Vision)
  async processImage(base64Data, mimeType, prompt) {
    try {
      // Format Payload Standar OpenAI Vision
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                // Format Data URI: data:image/jpeg;base64,....
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
          ],
        },
      ];

      // Debugging
      console.log(`📤 Sending Image to LM Studio (${this.model})...`);

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          temperature: 0.1, // Rendah agar akurat baca angka
          max_tokens: 200, // Output struk cuma butuh sedikit token (angka)
          stream: false,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      const resultText = response.data.choices[0].message.content;
      // console.log("📥 LMStudio Vision Result:", resultText);

      return resultText;
    } catch (error) {
      console.error("❌ LMStudio Vision Error:", error.response?.data || error.message);

      // Cek error spesifik jika model menolak gambar
      if (error.response?.data?.error?.message?.includes("vision")) {
        console.error(
          "⚠️ Model yang Anda pakai mungkin TIDAK support Vision (Gambar). Coba ganti model."
        );
      }

      return "0"; // Return 0 string agar sistem tidak crash
    }
  }

  // HELPER JSON
  cleanAndParseJson(text) {
    try {
      let cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const firstBrace = cleanText.indexOf("{");
      const lastBrace = cleanText.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }

      return JSON.parse(cleanText);
    } catch (e) {
      console.error("⚠️ Failed to parse JSON from LMStudio:", text);
      return {
        intent: "CHITCHAT",
        reply: "Maaf, saya kurang paham. Bisa diulangi?",
      };
    }
  }
}

export default LMStudioAdapter;
