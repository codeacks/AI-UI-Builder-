export const ALLOWED_COMPONENTS = [
  "Button",
  "Card",
  "Input",
  "Table",
  "Modal",
  "Sidebar",
  "Navbar",
  "Chart",
] as const;

export type AllowedComponent = (typeof ALLOWED_COMPONENTS)[number];

export type LayoutMode = "stack" | "grid" | "split";

export type UINode = {
  id: string;
  component: AllowedComponent;
  props: Record<string, unknown>;
  children?: UINode[];
};

export type UIPlan = {
  mode: LayoutMode;
  root: UINode[];
  modificationInstructions?: string;
};

export type PlannerInput = {
  intent: string;
  priorPlan?: UIPlan;
  regenerateFromScratch?: boolean;
};

export type PlannerResult = {
  plan: UIPlan;
  warnings: string[];
};

export type GeneratorInput = {
  plan: UIPlan;
  priorCode?: string;
};

export type GeneratorResult = {
  code: string;
  usedComponents: AllowedComponent[];
};

export type ExplainerInput = {
  intent: string;
  plan: UIPlan;
  code: string;
  isModification: boolean;
};

export type AgentLogEvent = {
  stage: "planner" | "generator" | "explainer" | "safety";
  timestamp: string;
  detail: string;
};

export type StaticAnalysisFinding = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
};

export type StaticAnalysisReport = {
  score: number;
  findings: StaticAnalysisFinding[];
  metrics: {
    lineCount: number;
    jsxCount: number;
    importCount: number;
  };
};

export type GenerationAction = "generate" | "modify" | "regenerate";

export type VersionSnapshot = {
  id: string;
  createdAt: string;
  intent: string;
  action: GenerationAction;
  baseVersionId?: string;
  plan: UIPlan;
  code: string;
  explanation: string;
  analysis: StaticAnalysisReport;
};
