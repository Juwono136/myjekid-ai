import { GoogleGenerativeAI } from "@google/generative-ai";

class GeminiAdapter {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }

  // Chat Text
  async generateResponse(systemPrompt, userMessage, context = {}) {
    try {
      // Gabungkan System Prompt + Context + User Message
      const prompt = `
        ${systemPrompt}
        
        CONTEXT DATA:
        ${JSON.stringify(context)}
        
        USER MESSAGE:
        "${userMessage}"
        
        Outputkan hanya JSON sesuai format yang diminta.
      `;

      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      // Bersihkan format markdown ```json ... ``` jika ada
      const cleanedText = responseText.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanedText);
    } catch (error) {
      console.error("[Gemini Adapter] Error:", error);
      throw error;
    }
  }

  // Fungsi OCR
  async processImage(base64Data, mimeType, prompt) {
    try {
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
      ]);

      const text = result.response
        .text()
        .replace(/```json|```/g, "")
        .trim();
      return JSON.parse(text);
    } catch (error) {
      console.error("[Gemini Vision] Error:", error);
      return { total_amount: 0 };
    }
  }
}

export default GeminiAdapter;
