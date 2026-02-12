import { GeneratorInput, GeneratorResult, UINode } from "@/types/agent";
import { ALLOWED_COMPONENTS } from "@/types/agent";
import { createLogger } from "@/lib/logger";
import { validateGeneratedCode, validatePlan } from "@/lib/validation";

function renderNode(node: UINode, depth = 4): string {
  const indent = " ".repeat(depth);
  const children = (node.children ?? []).map((child) => renderNode(child, depth + 2)).join("\n");
  const safeProps = JSON.stringify(node.props);

  if (children.length) {
    return `${indent}<${node.component} {...${safeProps}}>\n${children}\n${indent}</${node.component}>`;
  }

  return `${indent}<${node.component} {...${safeProps}} />`;
}

function composeLayout(nodes: UINode[], mode: "stack" | "grid" | "split"): string {
  const itemMarkup = nodes.map((n) => renderNode(n, 6)).join("\n");

  const layoutClassMap = {
    stack: "space-y-4",
    grid: "grid grid-cols-1 gap-4 md:grid-cols-2",
    split: "grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]",
  } as const;

  return `
    <section className="${layoutClassMap[mode]}">
${itemMarkup}
    </section>
  `.trimEnd();
}

function collectComponents(node: UINode): UINode["component"][] {
  const nested = (node.children ?? []).flatMap((child) => collectComponents(child));
  return [node.component, ...nested];
}

export function runGenerator(input: GeneratorInput): GeneratorResult & { logs: import("@/types/agent").AgentLogEvent[] } {
  const logger = createLogger();

  const validation = validatePlan(input.plan);
  if (!validation.valid) {
    throw new Error(`Generator received invalid plan: ${validation.error}`);
  }

  const usedComponents = Array.from(new Set(input.plan.root.flatMap((n) => collectComponents(n))));

  const unauthorized = usedComponents.filter((c) => !ALLOWED_COMPONENTS.includes(c));
  if (unauthorized.length) {
    throw new Error(`Component whitelist violation: ${unauthorized.join(", ")}`);
  }

  logger.push("generator", `components=${usedComponents.join(",")}`);

  const imports = `import { ${Array.from(new Set([...usedComponents, "Card", "Button", "Input", "Table", "Modal", "Sidebar", "Navbar", "Chart"])).join(", ")} } from "@/components/ui";`;
  const serializedPlan = JSON.stringify(input.plan, null, 2).replace(/`/g, "\\`");

  const code = `${imports}

const uiPlanJson = \`${serializedPlan}\`;

export default function GeneratedUI() {
  return (
    <main className="space-y-4">
${composeLayout(input.plan.root, input.plan.mode)}
    </main>
  );
}
`;

  const codeValidation = validateGeneratedCode(code);
  if (!codeValidation.valid) {
    throw new Error(`Generated code failed safety checks: ${codeValidation.error}`);
  }

  logger.push("generator", "Generated code passed validation");

  return { code, usedComponents, logs: logger.all() };
}

