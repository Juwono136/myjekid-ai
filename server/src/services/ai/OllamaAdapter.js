import axios from "axios";

class OllamaAdapter {
  constructor(baseUrl, model) {
    this.baseUrl = baseUrl || "http://localhost:11434";
    this.model = model || "llama3";
  }

  async generateResponse(systemPrompt, userMessage, context = {}) {
    try {
      const prompt = `${systemPrompt}\nCONTEXT: ${JSON.stringify(
        context
      )}\nUSER: ${userMessage}\nOutput JSON only.`;

      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: this.model,
        prompt: prompt,
        format: "json", // Ollama support JSON mode
        stream: false,
      });

      return JSON.parse(response.data.response);
    } catch (error) {
      console.error("[Ollama] Error:", error);
      throw error;
    }
  }

  // Ollama Vision
  async extractInvoiceData(imageBuffer) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: "llava", // Wajib install model llava di ollama
        prompt: "Find 'Total Tagihan' amount. Output JSON format: { \"total_amount\": 12345 }",
        images: [imageBuffer.toString("base64")],
        stream: false,
        format: "json",
      });

      return JSON.parse(response.data.response);
    } catch (error) {
      console.error("[Ollama Vision] Error (Pastikan model 'llava' terinstall):", error);
      return { total_amount: 0 };
    }
  }
}

export default OllamaAdapter;
