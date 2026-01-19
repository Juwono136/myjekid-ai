import OpenAI from "openai";

class OpenAiAdapter {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.modelName = "gpt-4o-mini"; // Disarankan pakai model 'mini' atau 'gpt-4o' agar cepat & murah
  }

  // --- GENERATE RESPONSE (CHAT AGENT) ---
  async generateResponse(systemPrompt, userContextString) {
    try {
      const messages = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `CURRENT CONTEXT: ${userContextString}`,
        },
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.modelName,
        messages,
        temperature: 0.7, // Kreativitas sedang agar natural
        response_format: { type: "json_object" }, // Wajib JSON
      });

      const rawContent = completion.choices[0].message.content;
      return JSON.parse(rawContent);
    } catch (error) {
      console.error("[OpenAI] Generate Error:", error.message);
      return null;
    }
  }

  // --- PROCESS IMAGE (VISION) ---
  async processImage(base64Data, mimeType, prompt) {
    try {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: `${prompt} REMEMBER: Return Valid JSON object.` },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
                detail: "low", // 'Low' cukup untuk baca angka struk, lebih hemat token
              },
            },
          ],
        },
      ];

      const response = await this.openai.chat.completions.create({
        model: this.modelName,
        messages,
        max_tokens: 300,
        response_format: { type: "json_object" }, // Paksa JSON output
      });

      const rawContent = response.choices[0].message.content;
      return JSON.parse(rawContent);
    } catch (error) {
      console.error("[OpenAI] Vision Error:", error.message);
      return null;
    }
  }
}

export default OpenAiAdapter;
