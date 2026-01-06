import GeminiAdapter from "./GeminiAdapter.js";
import OpenAiAdapter from "./OpenAiAdapter.js";
import OllamaAdapter from "./OllamaAdapter.js";
import LMStudioAdapter from "./LMStudioAdapter.js";

class AIAdapterFactory {
  static createAdapter() {
    const provider = process.env.AI_PROVIDER || "GEMINI";

    switch (provider.toUpperCase()) {
      case "OPENAI":
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");
        console.log("🤖 AI Provider: OPENAI (GPT)");
        return new OpenAiAdapter(process.env.OPENAI_API_KEY);

      case "OLLAMA":
        console.log("🤖 AI Provider: OLLAMA (Local)");
        return new OllamaAdapter(process.env.OLLAMA_BASE_URL, process.env.OLLAMA_MODEL);

      case "LMSTUDIO":
        console.log("🤖 AI Provider: LMSTUDIO (Local)");
        return new LMStudioAdapter(process.env.LMSTUDIO_BASE_URL, process.env.LMSTUDIO_MODEL);

      case "GEMINI":
      default:
        if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing");
        console.log("🤖 AI Provider: GOOGLE GEMINI");
        return new GeminiAdapter(process.env.GEMINI_API_KEY);
    }
  }
}

export default AIAdapterFactory;
