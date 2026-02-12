import { NextRequest, NextResponse } from "next/server";
import { runPlanner } from "@/agent/planner";
import { runGenerator } from "@/agent/generator";
import { runExplainer } from "@/agent/explainer";
import { analyzeGeneratedCode } from "@/lib/validation";
import { versionStore } from "@/lib/versionStore";
import { GenerationAction, VersionSnapshot } from "@/types/agent";

type AgentRequestBody = {
  intent?: string;
  action?: GenerationAction;
  baseVersionId?: string;
};

async function executePipeline(body: AgentRequestBody) {
  const intent = body.intent?.trim() ?? "";
  const action = body.action ?? "generate";
  const baseVersion = body.baseVersionId ? versionStore.get(body.baseVersionId) : null;
  const latest = versionStore.latest();
  const workingBase = baseVersion ?? latest;

  if (!intent) {
    throw new Error("Intent is required");
  }

  const planner = await runPlanner({
    intent,
    priorPlan: action === "modify" ? workingBase?.plan : undefined,
    regenerateFromScratch: action === "regenerate",
  });

  const generator = runGenerator({
    plan: planner.plan,
    priorCode: action === "modify" ? workingBase?.code : undefined,
  });

  const explainer = await runExplainer({
    intent,
    plan: planner.plan,
    code: generator.code,
    isModification: action === "modify" && !!workingBase,
  });

  const analysis = analyzeGeneratedCode(generator.code, planner.plan);
  const version = versionStore.add({
    intent,
    action,
    baseVersionId: workingBase?.id,
    plan: planner.plan,
    code: generator.code,
    explanation: explainer.explanation,
    analysis,
  });

  return {
    version,
    logs: [...planner.logs, ...generator.logs, ...explainer.logs],
    warnings: planner.warnings,
  };
}

function streamFromPipeline(body: AgentRequestBody) {
  const encoder = new TextEncoder();
  const write = (controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) => {
    controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        write(controller, { type: "status", message: "Planner started" });
        const intent = body.intent?.trim() ?? "";
        const action = body.action ?? "generate";
        const baseVersion = body.baseVersionId ? versionStore.get(body.baseVersionId) : null;
        const latest = versionStore.latest();
        const workingBase = baseVersion ?? latest;
        if (!intent) {
          throw new Error("Intent is required");
        }

        const planner = await runPlanner({
          intent,
          priorPlan: action === "modify" ? workingBase?.plan : undefined,
          regenerateFromScratch: action === "regenerate",
        });
        write(controller, { type: "status", message: "Planner completed" });

        const generator = runGenerator({
          plan: planner.plan,
          priorCode: action === "modify" ? workingBase?.code : undefined,
        });
        write(controller, { type: "status", message: "Generator completed" });

        const explainer = await runExplainer({
          intent,
          plan: planner.plan,
          code: generator.code,
          isModification: action === "modify" && !!workingBase,
        });
        write(controller, { type: "status", message: "Explainer completed" });

        const analysis = analyzeGeneratedCode(generator.code, planner.plan);
        const version: VersionSnapshot = versionStore.add({
          intent,
          action,
          baseVersionId: workingBase?.id,
          plan: planner.plan,
          code: generator.code,
          explanation: explainer.explanation,
          analysis,
        });

        const lines = explainer.explanation.split("\n").filter(Boolean);
        for (const line of lines) {
          write(controller, { type: "explanation_chunk", chunk: `${line}\n` });
        }

        write(controller, {
          type: "final",
          version,
          logs: [...planner.logs, ...generator.logs, ...explainer.logs],
          warnings: planner.warnings,
        });
        controller.close();
      } catch (error) {
        write(controller, {
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        controller.close();
      }
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const stream = req.nextUrl.searchParams.get("stream") === "1";
    const body = (await req.json()) as AgentRequestBody;

    if (stream) {
      return new Response(streamFromPipeline(body), {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const payload = await executePipeline(body);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
