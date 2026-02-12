import { ExplainerInput } from "@/types/agent";
import { explainerSystemPrompt, explainerUserPrompt } from "@/agent/prompts";
import { callLLM } from "@/lib/llm";
import { createLogger } from "@/lib/logger";

export async function runExplainer(input: ExplainerInput): Promise<{ explanation: string; logs: import("@/types/agent").AgentLogEvent[] }> {
  const logger = createLogger();

  const llm = await callLLM([
    { role: "system", content: explainerSystemPrompt },
    { role: "user", content: explainerUserPrompt(input.intent, input.plan, input.code) },
  ]);

  if (llm) {
    logger.push("explainer", "LLM explanation generated");
    return { explanation: llm, logs: logger.all() };
  }

  logger.push("explainer", "Fallback explanation generated");
  const componentSet = Array.from(new Set(input.plan.root.map((n) => n.component))).join(", ");
  const explanation = [
    `Layout mode: ${input.plan.mode} was selected to match the requested information density and hierarchy.`,
    `Component selection: ${componentSet}. All components come from the fixed deterministic library.`,
    input.isModification
      ? "This is an incremental edit. Existing plan structure was preserved and only requested sections were updated."
      : "This was generated as a new baseline screen.",
  ].join("\n");

  return { explanation, logs: logger.all() };
}

