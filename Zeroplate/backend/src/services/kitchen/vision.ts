import axios from "axios";
import crypto from "crypto";
import { env } from "../../config/env";

export interface VisionItem { dishId: string; grams: number; confidence: number }
export interface VisionResult { model: string; provider: "groq" | "anthropic" | "mock"; mock: boolean; items: VisionItem[]; warning?: string }
type Dish = { id: string; name: string };
const cache = new Map<string, VisionResult>(); // identical photos are not re-analyzed

// Checks real file signature (JPEG, PNG, WebP), not just the declared type.
export const isRealImage = (b64: string): boolean => {
  const b = Buffer.from(b64.slice(0, 24), "base64");
  return (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP");
};

export const mockEstimate = (b64: string, dishes: { id: string }[]): VisionItem[] => {
  let seed = 0;
  for (let i = 0; i < b64.length; i += 97) seed = (seed * 31 + b64.charCodeAt(i)) % 100003;
  const items: VisionItem[] = [];
  for (let k = 0; k < 2 + (seed % 2) && dishes.length; k++) {
    const d = dishes[(seed + k * 2) % dishes.length]!;
    if (!items.some((x) => x.dishId === d.id)) items.push({ dishId: d.id, grams: 90 + ((seed * (k + 7)) % 310), confidence: 52 + ((seed * (k + 3)) % 42) });
  }
  return items;
};

// Models are asked for dish NAMES (more reliable than ids) and we map them back to ids.
export const buildPrompt = (dishes: Dish[]): string =>
  `You audit kitchen food waste. The photo shows leftover food. Known dishes: ${dishes.map((d) => d.name).join(", ")}. ` +
  `List only leftovers you can identify that match a known dish. For each give the dish name exactly as written, the estimated wasted weight in grams, and your confidence from 0 to 100. ` +
  `Reply with ONLY JSON: {"items":[{"dish":"<name>","grams":<number>,"confidence":<number>}]}. Use {"items":[]} if nothing matches.`;

// Tolerates reasoning blocks, code fences, a bare array, or {"items": [...]}; drops anything that is not a known dish.
export function parseVisionJson(text: string, dishes: Dish[]): VisionItem[] {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json|```/gi, "").trim();
  const opens = [clean.indexOf("{"), clean.indexOf("[")].filter((i) => i >= 0);
  const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  if (!opens.length || end < 0) throw new Error("Model reply contained no JSON");
  const v = JSON.parse(clean.slice(Math.min(...opens), end + 1));
  const arr: any[] = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : [];
  const byName = new Map(dishes.map((d) => [d.name.trim().toLowerCase(), d.id]));
  const ids = new Set(dishes.map((d) => d.id));
  const out: VisionItem[] = [];
  for (const i of arr) {
    const id = byName.get(String(i?.dish ?? "").trim().toLowerCase()) ?? (ids.has(String(i?.dishId)) ? String(i.dishId) : undefined);
    const grams = Number(i?.grams);
    if (!id || !(grams > 0) || out.some((o) => o.dishId === id)) continue;
    const conf = Number(i?.confidence);
    out.push({ dishId: id, grams: Math.min(20000, Math.round(grams)), confidence: Math.max(0, Math.min(100, Math.round(Number.isFinite(conf) ? conf : 50))) });
  }
  return out;
}

const why = (e: any): string => e?.response?.data?.error?.message || e?.message || "unknown error";

async function groq(b64: string, mime: string, dishes: Dish[]): Promise<VisionResult> {
  const body: Record<string, unknown> = {
    model: env.GROQ_VISION_MODEL, temperature: 0.2, max_completion_tokens: 2000, response_format: { type: "json_object" },
    messages: [{ role: "user", content: [{ type: "text", text: buildPrompt(dishes) }, { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }] }],
  };
  if (env.GROQ_REASONING_EFFORT) body.reasoning_effort = env.GROQ_REASONING_EFFORT;
  const r = await axios.post("https://api.groq.com/openai/v1/chat/completions", body, { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, timeout: 25000 });
  const text: string = r.data?.choices?.[0]?.message?.content ?? "";
  return { model: `groq:${env.GROQ_VISION_MODEL}`, provider: "groq", mock: false, items: parseVisionJson(text, dishes) };
}

async function claude(b64: string, mime: string, dishes: Dish[]): Promise<VisionResult> {
  const r = await axios.post(
    "https://api.anthropic.com/v1/messages",
    { model: env.VISION_MODEL, max_tokens: 600, messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mime, data: b64 } }, { type: "text", text: buildPrompt(dishes) }] }] },
    { headers: { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" }, timeout: 20000 }
  );
  const text = (r.data.content as { text?: string }[]).map((c) => c.text || "").join("");
  return { model: r.data.model || env.VISION_MODEL, provider: "anthropic", mock: false, items: parseVisionJson(text, dishes) };
}

export const chooseProvider = (): "groq" | "anthropic" | "mock" =>
  env.VISION_PROVIDER === "auto" ? (env.GROQ_API_KEY ? "groq" : env.ANTHROPIC_API_KEY ? "anthropic" : "mock") : env.VISION_PROVIDER;

export async function analyzeImage(b64: string, mime: string, dishes: Dish[]): Promise<VisionResult> {
  const provider = chooseProvider();
  const key = crypto.createHash("sha256").update(provider).update(b64).update(dishes.map((d) => d.id).join(",")).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;
  let warning: string | undefined;
  if (provider === "groq" && !env.GROQ_API_KEY) warning = "GROQ_API_KEY is not set";
  else if (provider === "anthropic" && !env.ANTHROPIC_API_KEY) warning = "ANTHROPIC_API_KEY is not set";
  else if (provider !== "mock") {
    try {
      const out = await (provider === "groq" ? groq : claude)(b64, mime, dishes);
      cache.set(key, out);
      if (cache.size > 200) cache.delete(cache.keys().next().value as string);
      return out;
    } catch (e: any) {
      warning = `${provider} vision failed: ${why(e)}`;
      console.warn(warning);
    }
  }
  return { model: "mock-estimator", provider: "mock", mock: true, items: mockEstimate(b64, dishes), ...(warning ? { warning } : {}) };
}
