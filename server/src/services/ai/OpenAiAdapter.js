import OpenAI from "openai";

class OpenAiAdapter {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.modelName = "gpt-4o-mini";
    this.visionModel = "gpt-4o-mini";
  }

  async generateResponse(systemPrompt, userText, context = {}) {
    try {
      const contextString = JSON.stringify(context, null, 2);

      const messages = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content:
            `CONTEXT DATA:\n${contextString}\n\n` +
            `USER MESSAGE:\n"${userText}"\n\n` +
            `(Respond ONLY in Valid JSON format)`,
        },
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.modelName,
        messages,
        temperature: 0.1,
      });

      const rawContent = completion.choices[0].message.content;
      return this.cleanAndParseJson(rawContent);
    } catch (error) {
      console.error("[OpenAI] Error:", error.message);
      return {
        intent: "CHITCHAT",
        reply:
          "Maaf, sepertinya sistem aplikasi sedang mengalami gangguan. Mohon coba beberapa saat lagi 🙏",
        data: {},
      };
    }
  }

  async extractInvoiceData(imageBuffer) {
    try {
      const base64Image = imageBuffer.toString("base64");

      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analisa gambar struk. Cari 'Total Tagihan'. " +
                "Respond ONLY in Valid JSON format: { total_amount: number }",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ];

      const response = await this.openai.chat.completions.create({
        model: this.visionModel,
        messages,
        max_tokens: 300,
        temperature: 0.1,
      });

      return this.cleanAndParseJson(response.choices[0].message.content);
    } catch (error) {
      console.error("[OpenAI Vision] Error:", error.message);
      return { total_amount: 0 };
    }
  }

  cleanAndParseJson(text) {
    try {
      let clean = text.replace(/```json|```/g, "").trim();
      const first = clean.indexOf("{");
      const last = clean.lastIndexOf("}");
      if (first !== -1 && last !== -1) {
        clean = clean.substring(first, last + 1);
      }
      return JSON.parse(clean);
    } catch (e) {
      return {
        intent: "CHITCHAT",
        reply: text,
        data: {},
      };
    }
  }
}

export default OpenAiAdapter;
