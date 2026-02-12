import { runPlanner } from "@/agent/planner";
import { runGenerator } from "@/agent/generator";
import { runExplainer } from "@/agent/explainer";

async function run() {
  const firstIntent = "Create a dashboard with navbar, sidebar, card and chart";
  const first = await runPlanner({ intent: firstIntent });
  const firstCode = runGenerator({ plan: first.plan });
  const firstExplain = await runExplainer({
    intent: firstIntent,
    plan: first.plan,
    code: firstCode.code,
    isModification: false,
  });

  const secondIntent = "Add a settings modal and make the layout minimal";
  const second = await runPlanner({ intent: secondIntent, priorPlan: first.plan });
  const secondCode = runGenerator({ plan: second.plan, priorCode: firstCode.code });
  const secondExplain = await runExplainer({
    intent: secondIntent,
    plan: second.plan,
    code: secondCode.code,
    isModification: true,
  });

  console.log("=== Iterative Edit Example ===");
  console.log("Initial mode:", first.plan.mode);
  console.log("Modified mode:", second.plan.mode);
  console.log("Modal exists:", second.plan.root.some((n) => n.component === "Modal"));
  console.log("Initial explanation length:", firstExplain.explanation.length);
  console.log("Modified explanation length:", secondExplain.explanation.length);
  console.log("Generated code length:", secondCode.code.length);
}

void run();
