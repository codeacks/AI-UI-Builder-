import {
  PlannerInput,
  PlannerResult,
  UIPlan,
  UINode,
} from "@/types/agent";
import { callLLM } from "@/lib/llm";
import { filterPromptInjection, validatePlan } from "@/lib/validation";
import { plannerSystemPrompt, plannerUserPrompt } from "@/agent/prompts";
import { createLogger } from "@/lib/logger";

type IntentComponent =
  | "Navbar"
  | "Sidebar"
  | "Card"
  | "Input"
  | "Button"
  | "Table"
  | "Modal"
  | "Chart";

const STOPWORDS = new Set([
  "create",
  "build",
  "make",
  "design",
  "generate",
  "ui",
  "page",
  "screen",
  "dashboard",
  "app",
  "website",
  "for",
  "with",
  "and",
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "from",
  "that",
  "this",
]);

function hashIntent(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickByHash<T>(items: T[], hash: number, offset = 0): T {
  return items[(hash + offset) % items.length];
}

function extractKeyPhrases(intent: string): string[] {
  const words = intent
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const uniq = Array.from(new Set(words));
  return uniq.slice(0, 6);
}

function createNodeFactory() {
  let counter = 1;
  return (
    component: UINode["component"],
    props: Record<string, unknown>,
    children?: UINode[],
  ): UINode => ({
    id: `${component.toLowerCase()}-${counter++}`,
    component,
    props,
    ...(children ? { children } : {}),
  });
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferTopic(intent: string): string {
  const phrases = extractKeyPhrases(intent);
  if (!phrases.length) {
    return "Workspace";
  }
  return toTitleCase(phrases.slice(0, 2).join(" "));
}

function inferMode(intent: string): UIPlan["mode"] {
  if (/minimal|simple|clean|single column|stack/i.test(intent)) return "stack";
  if (/grid|cards layout|two columns/i.test(intent)) return "grid";
  return "split";
}

function inferRequestedComponents(intent: string): Set<IntentComponent> {
  const text = intent.toLowerCase();
  const requested = new Set<IntentComponent>();

  if (/\bnavbar|header|top nav|navigation\b/.test(text)) requested.add("Navbar");
  if (/\bsidebar|side nav|left nav\b/.test(text)) requested.add("Sidebar");
  if (/\bcard|panel|widget|section\b/.test(text)) requested.add("Card");
  if (/\binput|field|form|search|textbox|text box|login|signup|register\b/.test(text)) requested.add("Input");
  if (/\bbutton|cta|submit|action\b/.test(text)) requested.add("Button");
  if (/\btable|list|rows|columns|grid data\b/.test(text)) requested.add("Table");
  if (/\bmodal|dialog|popup\b/.test(text)) requested.add("Modal");
  if (/\bchart|graph|analytics|stats|trend|metrics\b/.test(text)) requested.add("Chart");

  if (/\bdashboard|admin|portal|console\b/.test(text)) {
    requested.add("Navbar");
    requested.add("Sidebar");
    requested.add("Card");
    requested.add("Chart");
  }

  if (/\blogin|sign in|signup|register|auth\b/.test(text)) {
    requested.add("Card");
    requested.add("Input");
    requested.add("Button");
  }

  if (/\bfeed|social|linkedin|twitter|instagram\b/.test(text)) {
    requested.add("Navbar");
    requested.add("Sidebar");
    requested.add("Card");
    requested.add("Table");
  }

  if (!requested.size) {
    requested.add("Navbar");
    requested.add("Card");
    requested.add("Input");
    requested.add("Button");
  }

  return requested;
}

function buildIntentAwarePlan(intent: string): UIPlan {
  const node = createNodeFactory();
  const mode = inferMode(intent);
  const topic = inferTopic(intent);
  const hash = hashIntent(intent.toLowerCase());
  const phrases = extractKeyPhrases(intent);
  const requested = inferRequestedComponents(intent);
  const root: UINode[] = [];
  const text = intent.toLowerCase();

  const altNavSets = [
    ["Overview", "Discover", "Updates", "Settings"],
    ["Home", "Insights", "Tasks", "Team"],
    ["Feed", "Explore", "Alerts", "Profile"],
    ["Summary", "Pipelines", "Reports", "Preferences"],
  ];
  const altSidebarSets = [
    ["Dashboard", "Projects", "Timeline", "Members", "Settings"],
    ["Workspace", "Queue", "Approvals", "Analytics", "Admin"],
    ["Library", "Collections", "Bookmarks", "Notifications", "Help"],
    ["Catalog", "Operations", "Billing", "Users", "Security"],
  ];
  const actionPrimary = pickByHash(["Apply", "Create", "Save", "Search", "Launch"], hash, 1);
  const actionSecondary = pickByHash(["Reset", "Clear", "Cancel", "Back", "Filter"], hash, 2);

  if (requested.has("Navbar")) {
    const navLinks = /\bfeed|social|linkedin\b/.test(text)
      ? ["Home", "Network", "Jobs", "Messages", "Alerts"]
      : pickByHash(altNavSets, hash);
    root.push(node("Navbar", { title: `${topic} UI`, links: navLinks }));
  }

  if (requested.has("Sidebar")) {
    const sideItems = /\becommerce|store|shop\b/.test(text)
      ? ["Catalog", "Orders", "Customers", "Promotions", "Analytics"]
      : /\bfeed|social|linkedin\b/.test(text)
        ? ["Feed", "Profile", "Connections", "Groups", "Events"]
        : pickByHash(altSidebarSets, hash, 3);
    root.push(node("Sidebar", { title: `${topic} Menu`, items: sideItems }));
  }

  if (/\blogin|sign in|signup|register|auth\b/.test(text)) {
    root.push(
      node("Card", { title: `${topic} Authentication` }, [
        node("Input", { label: "Email", placeholder: "you@example.com" }),
        node("Input", { label: "Password", placeholder: "Enter password" }),
        node("Button", { label: /signup|register/.test(text) ? "Create Account" : "Sign In", variant: "primary" }),
      ]),
    );
  } else {
    if (requested.has("Card")) {
      const cardChildren: UINode[] = [];
      if (requested.has("Input")) {
        const inputLabel = phrases[0] ? `Search ${toTitleCase(phrases[0])}` : "Search";
        const inputPlaceholder = phrases.length
          ? `Find ${phrases.slice(0, 2).join(" ")}`
          : `Find ${topic.toLowerCase()} items`;
        cardChildren.push(node("Input", { label: "Search", placeholder: `Find ${topic.toLowerCase()} items` }));
        cardChildren[cardChildren.length - 1] = node("Input", { label: inputLabel, placeholder: inputPlaceholder });
      }
      if (requested.has("Button")) {
        cardChildren.push(node("Button", { label: actionPrimary, variant: "primary" }));
        cardChildren.push(node("Button", { label: actionSecondary, variant: "secondary" }));
      }
      root.push(node("Card", { title: `${topic} Controls` }, cardChildren.length ? cardChildren : undefined));
    }
  }

  if (requested.has("Table")) {
    const tableRows = /\bfeed|social|linkedin\b/.test(text)
      ? [
          ["Jane Doe", "Product Designer", "Connect"],
          ["Arjun Rao", "Software Engineer", "Message"],
          ["Nina Kim", "Marketing Lead", "Follow"],
        ]
      : buildTableRowsFromIntent(phrases, hash);
    const tableColumns =
      phrases.length >= 2
        ? [toTitleCase(phrases[0]), toTitleCase(phrases[1]), "Action"]
        : ["Name", "Status", "Action"];
    root.push(
      node("Card", { title: `${topic} Table` }, [
        node("Table", {
          columns: tableColumns,
          rows: tableRows,
        }),
      ]),
    );
  }

  if (requested.has("Chart")) {
    const chartData = buildChartData(hash);
    root.push(
      node("Chart", {
        title: `${topic} Metrics`,
        data: chartData,
      }),
    );
  }

  if (requested.has("Modal") || /\bsettings|preferences\b/.test(text)) {
    root.push(
      node("Modal", { title: `${topic} Settings`, open: true }, [
        node("Input", { label: "Display Name", placeholder: topic }),
        node("Button", { label: "Save", variant: "primary" }),
      ]),
    );
  }

  if (!root.length) {
    root.push(node("Card", { title: `${topic} Panel` }, [node("Button", { label: "Continue", variant: "primary" })]));
  }

  return { mode, root };
}

function buildTableRowsFromIntent(phrases: string[], hash: number): string[][] {
  const subjectA = toTitleCase(phrases[0] ?? "Item");
  const subjectB = toTitleCase(phrases[1] ?? "Status");
  const subjectC = toTitleCase(phrases[2] ?? "Owner");
  const states = ["Draft", "Active", "Review", "Blocked", "Done"];
  const actions = ["View", "Edit", "Open", "Inspect", "Track"];
  return [
    [`${subjectA} A`, pickByHash(states, hash, 1), `${subjectC} 1`],
    [`${subjectA} B`, pickByHash(states, hash, 2), `${subjectC} 2`],
    [`${subjectA} C`, pickByHash(states, hash, 3), pickByHash(actions, hash, 4)],
    [`${subjectB} D`, pickByHash(states, hash, 0), pickByHash(actions, hash, 2)],
  ];
}

function buildChartData(hash: number): Array<{ label: string; value: number }> {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels.map((label, idx) => {
    const value = 10 + ((hash >> (idx % 16)) % 26) + idx * 2;
    return { label, value };
  });
}

function addMinimalMode(plan: UIPlan): UIPlan {
  return {
    ...plan,
    mode: "stack",
    root: plan.root.map((node) => {
      if (node.component === "Navbar") {
        return { ...node, props: { title: "Minimal UI", links: ["Home", "Settings"] } };
      }
      return node;
    }),
  };
}

function mergeModification(intent: string, priorPlan: UIPlan): UIPlan {
  let next = structuredClone(priorPlan);
  const normalized = intent.toLowerCase();

  if (/minimal|simple|clean/.test(normalized)) {
    next = addMinimalMode(next);
  }

  if (/\bsettings\s+modal|settings dialog|settings popup\b/.test(normalized)) {
    const hasModal = next.root.some((n) => n.component === "Modal");
    if (!hasModal) {
      next.root.push({
        id: `modal-${Date.now()}`,
        component: "Modal",
        props: { title: "Settings", open: true },
        children: [
          { id: `input-${Date.now()}`, component: "Input", props: { label: "Theme", placeholder: "Light or Dark" } },
          { id: `save-${Date.now()}`, component: "Button", props: { label: "Save", variant: "primary" } },
        ],
      } as UINode);
    }
  }

  if (/\bconvert to|change to|make it like|turn into\b/.test(normalized)) {
    next = buildIntentAwarePlan(intent);
    next.modificationInstructions = `Converted UI based on request: ${intent}`;
    return next;
  }

  if (/\badd\b|\binclude\b|\binsert\b/.test(normalized)) {
    const requested = inferRequestedComponents(intent);
    const topic = inferTopic(intent);
    const node = createNodeFactory();

    if (requested.has("Chart") && !next.root.some((n) => n.component === "Chart")) {
      next.root.push(node("Chart", { title: `${topic} Metrics`, data: buildChartData(hashIntent(intent)) }));
    }
    if (requested.has("Table") && !next.root.some((n) => n.component === "Table" || (n.children ?? []).some((c) => c.component === "Table"))) {
      next.root.push(
        node("Card", { title: `${topic} Table` }, [
          node("Table", {
            columns: ["Name", "Status", "Action"],
            rows: buildTableRowsFromIntent(extractKeyPhrases(intent), hashIntent(intent)),
          }),
        ]),
      );
    }
    if (requested.has("Input") && !next.root.some((n) => (n.children ?? []).some((c) => c.component === "Input"))) {
      next.root.push(
        node("Card", { title: `${topic} Input` }, [
          node("Input", { label: "Search", placeholder: `Find ${topic.toLowerCase()} items` }),
          node("Button", { label: "Apply", variant: "primary" }),
        ]),
      );
    }
  }

  next.modificationInstructions = intent;
  return next;
}

export async function runPlanner(input: PlannerInput): Promise<PlannerResult & { logs: import("@/types/agent").AgentLogEvent[] }> {
  const logger = createLogger();
  const filtered = filterPromptInjection(input.intent);
  logger.push("safety", filtered.flagged ? "Prompt injection pattern flagged" : "No injection pattern detected");

  const shouldFullRegenerate = input.regenerateFromScratch || /regenerate\s+from\s+scratch/i.test(filtered.clean);
  logger.push("planner", `full_regenerate=${String(shouldFullRegenerate)}`);

  const llmRaw = await callLLM([
    { role: "system", content: plannerSystemPrompt },
    { role: "user", content: plannerUserPrompt(filtered.clean, input.priorPlan) },
  ]);

  if (llmRaw) {
    try {
      const parsed = JSON.parse(llmRaw) as unknown;
      const validation = validatePlan(parsed);
      if (validation.valid) {
        logger.push("planner", "LLM plan accepted by schema validation");
        return {
          plan: validation.plan,
          warnings: filtered.flagged ? ["Prompt injection patterns were sanitized"] : [],
          logs: logger.all(),
        };
      }
      logger.push("planner", `LLM plan rejected: ${validation.error}`);
    } catch {
      logger.push("planner", "LLM plan was not valid JSON; falling back to deterministic planner");
    }
  }

  let plan: UIPlan;
  if (!input.priorPlan || shouldFullRegenerate) {
    plan = buildIntentAwarePlan(filtered.clean);
    logger.push("planner", "Applied generic intent-aware deterministic planning");
  } else {
    plan = mergeModification(filtered.clean, input.priorPlan);
    logger.push("planner", "Applied deterministic incremental modification");
  }

  return {
    plan,
    warnings: filtered.flagged ? ["Prompt injection patterns were sanitized"] : [],
    logs: logger.all(),
  };
}
