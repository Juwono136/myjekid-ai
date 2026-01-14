import OpenAI from "openai";

class OpenAiAdapter {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.modelName = "gpt-4o-mini";
    this.visionModel = "gpt-4o-mini"; // Untuk vision
  }

  async generateResponse(systemPrompt, userMessage, context = {}) {
    try {
      const messages = [
        { role: "system", content: `${systemPrompt}\nCONTEXT: ${JSON.stringify(context)}` },
        { role: "user", content: userMessage },
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: messages,
        response_format: { type: "json_object" }, // Paksa output JSON
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("[OpenAI] Error:", error);
      throw error;
    }
  }

  async extractInvoiceData(imageBuffer) {
    try {
      const base64Image = imageBuffer.toString("base64");
      const response = await this.openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analisa gambar struk. Cari 'Total Tagihan'. Output JSON: { total_amount: number }",
              },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            ],
          },
        ],
        max_tokens: 300,
      });

      // Bersihkan markdown json jika ada
      const text = response.choices[0].message.content.replace(/```json|```/g, "").trim();
      return JSON.parse(text);
    } catch (error) {
      console.error("[OpenAI Vision] Error:", error);
      return { total_amount: 0 };
    }
  }
}

export default OpenAiAdapter;
