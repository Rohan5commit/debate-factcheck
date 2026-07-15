import { createCerebras } from "@ai-sdk/cerebras";

const cerebras = createCerebras({
  apiKey: process.env.CEREBRAS_API_KEY ?? "",
});

export function getCerebrasModel(model: string = "gpt-oss-120b") {
  return cerebras.chat(model);
}

export { cerebras };
