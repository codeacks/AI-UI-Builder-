import { NextRequest, NextResponse } from "next/server";
import { runPlanner } from "@/agent/planner";
import { runGenerator } from "@/agent/generator";
import { runExplainer } from "@/agent/explainer";
import { analyzeGeneratedCode } from "@/lib/validation";
import { versionStore } from "@/lib/versionStore";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { sourceVersionId?: string };
    if (!body.sourceVersionId) {
      return NextResponse.json({ error: "sourceVersionId is required" }, { status: 400 });
    }

    const source = versionStore.get(body.sourceVersionId);
    if (!source) {
      return NextResponse.json({ error: "Source version not found" }, { status: 404 });
    }

    const baseVersion = source.baseVersionId ? versionStore.get(source.baseVersionId) : null;

    const planner = await runPlanner({
      intent: source.intent,
      priorPlan: source.action === "modify" ? baseVersion?.plan : undefined,
      regenerateFromScratch: source.action === "regenerate",
    });

    const generator = runGenerator({
      plan: planner.plan,
      priorCode: source.action === "modify" ? baseVersion?.code : undefined,
    });

    const explainer = await runExplainer({
      intent: source.intent,
      plan: planner.plan,
      code: generator.code,
      isModification: source.action === "modify" && !!baseVersion,
    });

    const version = versionStore.add({
      intent: source.intent,
      action: source.action,
      baseVersionId: source.baseVersionId,
      plan: planner.plan,
      code: generator.code,
      explanation: `[Replay from ${source.id}]\n${explainer.explanation}`,
      analysis: analyzeGeneratedCode(generator.code, planner.plan),
    });

    return NextResponse.json({
      version,
      logs: [...planner.logs, ...generator.logs, ...explainer.logs],
      warnings: planner.warnings,
      replayedFrom: source.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
