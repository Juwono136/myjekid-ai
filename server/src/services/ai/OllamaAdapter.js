import axios from "axios";

class OllamaAdapter {
  constructor(baseUrl, model) {
    this.baseUrl = baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434/api";
    this.model = model || process.env.OLLAMA_MODEL || "llama3";
  }

  async generateResponse(systemPrompt, userText, context = {}) {
    try {
      const contextString = JSON.stringify(context, null, 2);

      const payload = {
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `CONTEXT:\n${contextString}\n\nUSER:\n${userText}\n\n(Format: JSON)`,
          },
        ],
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
      };

      const response = await axios.post(`${this.baseUrl}/chat`, payload);
      const rawContent = response.data.message.content;
      return JSON.parse(rawContent);
    } catch (error) {
      console.error("❌ Ollama Error:", error.message);
      return { intent: "CHITCHAT", reply: "Maaf, AI Lokal timeout.", data: {} };
    }
  }

  async processImage() {
    return "0";
  }
}

export default OllamaAdapter;
