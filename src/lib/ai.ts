export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

// Appel d'une API compatible OpenAI (/chat/completions)
export async function chatCompletion(messages: ChatMsg[]) {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("IA non configurée : ajoutez AI_API_KEY dans le fichier .env puis redémarrez le serveur.");
  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.AI_MODEL || "gpt-4o-mini", messages }),
    signal: AbortSignal.timeout(80_000),
  });
  if (!res.ok) throw new Error(`Erreur du service IA (HTTP ${res.status}). ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const text = (await res.json())?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Réponse vide du service IA.");
  return String(text);
}