import { createGroq } from "@ai-sdk/groq";

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY ?? "",
});

export function getGroqModel(model: string = "llama-3.1-8b-instant") {
  return groq.languageModel(model);
}

export { groq };
