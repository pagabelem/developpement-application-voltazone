import { z } from "zod";
import { auth } from "@/auth";
import { chatCompletion } from "@/lib/ai";
import { SYSTEM_PROMPT, buildDigest } from "@/lib/ai-context";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 90;

const hits = new Map<string, number[]>();
function limited(id: string) { // 20 requêtes / 10 minutes / utilisateur
  const now = Date.now();
  const arr = (hits.get(id) ?? []).filter((t) => now - t < 600_000);
  if (arr.length >= 20) { hits.set(id, arr); return true; }
  arr.push(now);
  hits.set(id, arr);
  return false;
}

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) })).min(1).max(14),
  scope: z.object({
    period: z.enum(["today", "yesterday", "week", "month", "custom"]), from: z.string().optional(), to: z.string().optional(),
    zoneId: z.string().optional(), site: z.string().optional(), teamId: z.string().optional(),
  }),
});

export async function POST(req: Request) {
  const s = await auth();
  const u = s?.user as any;
  if (!u?.id) return Response.json({ error: "Non connecté" }, { status: 401 });
  if (u.role === "CLIENT") return Response.json({ error: "Assistant non disponible pour ce profil." }, { status: 403 });
  if (limited(u.id)) return Response.json({ error: "Trop de requêtes : réessayez dans quelques minutes." }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Requête invalide." }, { status: 400 });
  try {
    const digest = await buildDigest({ id: u.id, name: u.name ?? "", role: u.role, lot: u.lot ?? null }, body.data.scope);
    const answer = await chatCompletion([{ role: "system", content: `${SYSTEM_PROMPT}\n\nDONNÉES (JSON) :\n${digest}` }, ...body.data.messages]);
    await logAudit(u.id, "AI", "chat", "QUERY", undefined, { scope: body.data.scope });
    return Response.json({ answer });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur de l'assistant." }, { status: 502 });
  }
}