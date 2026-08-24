import { createGroq } from "@ai-sdk/groq";

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY ?? "",
});

export function getGroqModel(model: string = "llama-3.3-70b-versatile") {
  return groq.chat(model);
}

export { groq };
