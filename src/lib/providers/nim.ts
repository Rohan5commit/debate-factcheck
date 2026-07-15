import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const nim = createOpenAICompatible({
  name: "nim",
  baseURL: "https://integrate.api.nvidia.com/v1",
  headers: {
    Authorization: `Bearer ${process.env.NVIDIA_NIM_API_KEY}`,
  },
});

export function getNIMModel(model: string = "meta/llama-3.3-70b-instruct") {
  return nim.chatModel(model);
}

export { nim };
