const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function callGroq(
  prompt: string,
  maxOutputTokens: number = 300,
  model: string = "openai/gpt-oss-20b"
): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxOutputTokens,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `Groq API error ${response.status}: ${err?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}
