import { GoogleGenerativeAI } from "@google/generative-ai";

class GeminiAdapter {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }

  // Fungsi Utama: Chat Text
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

  // Fungsi OCR (Vision)
  async extractInvoiceData(imageBuffer) {
    try {
      const prompt =
        "Analisa gambar struk ini. Cari teks 'Total Tagihan' atau 'Grand Total'. Ambil angkanya saja. Output JSON: { total_amount: number }";

      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBuffer.toString("base64"),
            mimeType: "image/jpeg",
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
