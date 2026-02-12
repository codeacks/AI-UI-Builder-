import { z } from "zod";
import {
  ALLOWED_COMPONENTS,
  StaticAnalysisFinding,
  StaticAnalysisReport,
  UIPlan,
  UINode,
} from "@/types/agent";

const componentEnum = z.enum(ALLOWED_COMPONENTS);

const uiNodeSchema: z.ZodType<UINode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    component: componentEnum,
    props: z.record(z.unknown()),
    children: z.array(uiNodeSchema).optional(),
  }),
);

export const uiPlanSchema = z.object({
  mode: z.enum(["stack", "grid", "split"]),
  root: z.array(uiNodeSchema).min(1),
  modificationInstructions: z.string().optional(),
});

const buttonPropsSchema = z.object({
  label: z.string().min(1),
  variant: z.enum(["primary", "secondary"]).optional(),
}).strict();

const cardPropsSchema = z.object({
  title: z.string().min(1),
}).strict();

const inputPropsSchema = z.object({
  label: z.string().min(1),
  placeholder: z.string().optional(),
  value: z.string().optional(),
}).strict();

const tablePropsSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
}).strict();

const modalPropsSchema = z.object({
  title: z.string().min(1),
  open: z.boolean(),
}).strict();

const sidebarPropsSchema = z.object({
  title: z.string().min(1),
  items: z.array(z.string()),
}).strict();

const navbarPropsSchema = z.object({
  title: z.string().min(1),
  links: z.array(z.string()),
}).strict();

const chartPropsSchema = z.object({
  title: z.string().min(1),
  data: z.array(z.object({ label: z.string(), value: z.number() }).strict()),
}).strict();

const componentPropsValidators: Record<UINode["component"], z.ZodSchema> = {
  Button: buttonPropsSchema,
  Card: cardPropsSchema,
  Input: inputPropsSchema,
  Table: tablePropsSchema,
  Modal: modalPropsSchema,
  Sidebar: sidebarPropsSchema,
  Navbar: navbarPropsSchema,
  Chart: chartPropsSchema,
};

const childCapableComponents = new Set<UINode["component"]>(["Card", "Modal"]);

const suspiciousPatterns = [
  /ignore\s+all\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /execute\s+code/i,
  /bypass\s+safety/i,
];

export function filterPromptInjection(input: string): { clean: string; flagged: boolean } {
  const flagged = suspiciousPatterns.some((pattern) => pattern.test(input));
  const clean = input.replace(/[<>]/g, "").trim();
  return { clean, flagged };
}

function validateNodeSchema(node: UINode, errors: string[], path: string) {
  const validator = componentPropsValidators[node.component];
  const propsValidation = validator.safeParse(node.props);
  if (!propsValidation.success) {
    errors.push(`${path}: invalid props for ${node.component}`);
  }

  if (!childCapableComponents.has(node.component) && node.children?.length) {
    errors.push(`${path}: ${node.component} does not allow children`);
  }

  (node.children ?? []).forEach((child, idx) => {
    validateNodeSchema(child, errors, `${path}.children[${idx}]`);
  });
}

export function validatePlan(payload: unknown): { valid: true; plan: UIPlan } | { valid: false; error: string } {
  const result = uiPlanSchema.safeParse(payload);
  if (!result.success) {
    return { valid: false, error: result.error.flatten().formErrors.join("; ") || "Invalid plan schema" };
  }

  const semanticErrors: string[] = [];
  result.data.root.forEach((node, idx) => validateNodeSchema(node, semanticErrors, `root[${idx}]`));
  if (semanticErrors.length) {
    return { valid: false, error: semanticErrors.join("; ") };
  }

  return { valid: true, plan: result.data };
}

export function validateGeneratedCode(code: string): { valid: boolean; error?: string } {
  if (!code.includes("from \"@/components/ui\"")) {
    return { valid: false, error: "Generated code must import from deterministic UI library" };
  }

  const badImport = /from\s+["'](?!@\/components\/ui)[^"']+["']/;
  if (badImport.test(code)) {
    return { valid: false, error: "Generated code contains non-whitelisted imports" };
  }

  if (/style=\{\{/.test(code)) {
    return { valid: false, error: "Inline styles are forbidden" };
  }

  if (/dangerouslySetInnerHTML/.test(code)) {
    return { valid: false, error: "dangerouslySetInnerHTML is forbidden" };
  }

  return { valid: true };
}

export function parsePlanFromCode(code: string): { valid: boolean; plan?: UIPlan; error?: string } {
  const match = code.match(/const\s+uiPlanJson\s*=\s*`([\s\S]*?)`;/);
  if (!match?.[1]) {
    return { valid: false, error: "Could not find uiPlanJson in generated code" };
  }

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    const validation = validatePlan(parsed);
    if (!validation.valid) {
      return { valid: false, error: validation.error };
    }
    return { valid: true, plan: validation.plan };
  } catch {
    return { valid: false, error: "Invalid uiPlanJson payload" };
  }
}

export function analyzeGeneratedCode(code: string, plan: UIPlan): StaticAnalysisReport {
  const findings: StaticAnalysisFinding[] = [];
  let score = 100;

  const lineCount = code.split("\n").length;
  const jsxCount = (code.match(/<[A-Za-z][A-Za-z0-9]*/g) ?? []).length;
  const importCount = (code.match(/^import\s+/gm) ?? []).length;

  if (/dangerouslySetInnerHTML/.test(code)) {
    findings.push({ level: "error", code: "dangerous-html", message: "Found forbidden dangerouslySetInnerHTML usage." });
    score -= 50;
  }

  if (/style=\{\{/.test(code)) {
    findings.push({ level: "error", code: "inline-style", message: "Found forbidden inline style usage." });
    score -= 30;
  }

  if (/className=\{`/.test(code)) {
    findings.push({ level: "warning", code: "dynamic-class", message: "Detected dynamic class composition; review deterministic styling constraints." });
    score -= 10;
  }

  const usedTags = Array.from(new Set(Array.from(code.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)).map((m) => m[1])));
  const illegalTags = usedTags.filter((tag) => !ALLOWED_COMPONENTS.includes(tag as (typeof ALLOWED_COMPONENTS)[number]) && tag !== "GeneratedUI");
  if (illegalTags.length) {
    findings.push({
      level: "error",
      code: "illegal-component",
      message: `Detected non-whitelisted JSX components: ${illegalTags.join(", ")}`,
    });
    score -= 40;
  }

  const expectedComponents = collectPlanComponents(plan);
  const missing = expectedComponents.filter((component) => !usedTags.includes(component));
  if (missing.length) {
    findings.push({
      level: "warning",
      code: "missing-component",
      message: `Generated code does not render some planned components: ${missing.join(", ")}`,
    });
    score -= 15;
  }

  if (!findings.length) {
    findings.push({ level: "info", code: "clean", message: "Static analysis found no safety or policy violations." });
  }

  return {
    score: Math.max(0, score),
    findings,
    metrics: { lineCount, jsxCount, importCount },
  };
}

function collectPlanComponents(plan: UIPlan): string[] {
  const out = new Set<string>();
  const walk = (node: UINode) => {
    out.add(node.component);
    (node.children ?? []).forEach(walk);
  };
  plan.root.forEach(walk);
  return Array.from(out);
}
