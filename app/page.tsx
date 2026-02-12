"use client";

import { useEffect, useMemo, useState } from "react";
import { parsePlanFromCode } from "@/lib/validation";
import { PreviewRenderer } from "@/components/PreviewRenderer";
import { StaticAnalysisReport, UIPlan, VersionSnapshot } from "@/types/agent";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type AgentResponse = {
  version: VersionSnapshot;
  logs: Array<{ stage: string; timestamp: string; detail: string }>;
  warnings: string[];
};

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "explanation_chunk"; chunk: string }
  | {
      type: "final";
      version: VersionSnapshot;
      logs: Array<{ stage: string; timestamp: string; detail: string }>;
      warnings: string[];
    }
  | { type: "error"; error: string };

type DiffLine = {
  kind: "same" | "added" | "removed";
  text: string;
};

type ActionMode = "generate" | "modify" | "regenerate";
type ThemeMode = "dark" | "light";

const MODE_CONFIG: Record<
  ActionMode,
  { welcome: string; helper: string; runLabel: string; emptyError: string }
> = {
  generate: {
    welcome: "Hey there! Comment your thought and let's build a brand-new UI.",
    helper: "Generate creates a new UI from your request.",
    runLabel: "Generate UI",
    emptyError: "Please enter what UI you want to generate.",
  },
  modify: {
    welcome: "Hey there! Describe what you want to change in the current UI.",
    helper: "Modify updates the selected version while preserving existing structure.",
    runLabel: "Apply Modification",
    emptyError: "Please describe what change you want to make.",
  },
  regenerate: {
    welcome: "Hey there! Tell me what to rebuild from scratch.",
    helper: "Regenerate discards current context and builds from scratch.",
    runLabel: "Regenerate From Scratch",
    emptyError: "Please enter what you want regenerated from scratch.",
  },
};

export default function HomePage() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mode, setMode] = useState<ActionMode>("generate");
  const [intent, setIntent] = useState(MODE_CONFIG.generate.welcome);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [code, setCode] = useState("");
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [explanation, setExplanation] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [streamStatus, setStreamStatus] = useState<string[]>([]);
  const [streamingExplanation, setStreamingExplanation] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<string>("");
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");

  const previewPlan = useMemo<UIPlan | null>(() => {
    if (!code.trim()) return null;
    const parsed = parsePlanFromCode(code);
    return parsed.valid ? parsed.plan ?? null : null;
  }, [code]);

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeVersionId) ?? null,
    [versions, activeVersionId],
  );

  const diffLines = useMemo(() => {
    const a = versions.find((v) => v.id === compareA)?.code ?? "";
    const b = versions.find((v) => v.id === compareB)?.code ?? "";
    if (!a || !b) return [];
    return buildLineDiff(a, b);
  }, [versions, compareA, compareB]);

  useEffect(() => {
    const saved = window.localStorage.getItem("ai-ui-builder-theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("ai-ui-builder-theme", theme);
  }, [theme]);

  useEffect(() => {
    void loadVersions();
  }, []);

  function handleModeChange(nextMode: ActionMode) {
    const prevDefault = MODE_CONFIG[mode].welcome;
    const isDefaultOrEmpty = intent.trim() === "" || intent === prevDefault;
    setMode(nextMode);
    if (isDefaultOrEmpty) {
      setIntent(MODE_CONFIG[nextMode].welcome);
    }
  }

  async function runAgent(action: ActionMode) {
    const requestText = intent.trim();
    if (!requestText || isStreaming) {
      return;
    }

    if (action === "modify" && !activeVersionId) {
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "No existing version selected to modify. Generate a UI first or select a version.",
        },
      ]);
      return;
    }

    if (requestText === MODE_CONFIG[action].welcome) {
      setChat((prev) => [...prev, { role: "assistant", text: MODE_CONFIG[action].emptyError }]);
      return;
    }

    setIsStreaming(true);
    setStreamingExplanation("");
    setStreamStatus([]);
    setChat((prev) => [...prev, { role: "user", text: requestText }]);

    try {
      const response = await fetch("/api/agent?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: requestText,
          action,
          baseVersionId: action === "modify" ? activeVersionId : undefined,
        }),
      });

      if (!response.ok || !response.body) {
        const msg = await response.text();
        setChat((prev) => [...prev, { role: "assistant", text: `Agent failed: ${msg}` }]);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "status") {
            setStreamStatus((prev) => [...prev, event.message]);
          } else if (event.type === "explanation_chunk") {
            setStreamingExplanation((prev) => prev + event.chunk);
          } else if (event.type === "final") {
            applyAgentPayload({
              version: event.version,
              logs: event.logs,
              warnings: event.warnings,
            });
          } else if (event.type === "error") {
            setChat((prev) => [...prev, { role: "assistant", text: `Agent failed: ${event.error}` }]);
          }
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function applyAgentPayload(payload: AgentResponse) {
    setCode(payload.version.code);
    setExplanation(payload.version.explanation);
    setLogs(payload.logs.map((entry) => `[${entry.stage}] ${entry.detail}`));
    setVersions((prev) => [payload.version, ...prev.filter((v) => v.id !== payload.version.id)]);
    setActiveVersionId(payload.version.id);
    setCompareA(payload.version.id);
    setCompareB((prev) => (prev === payload.version.id ? "" : prev));

    const warningText = payload.warnings.length ? `Warnings: ${payload.warnings.join(" | ")}` : "";
    setChat((prev) => [
      ...prev,
      {
        role: "assistant",
        text: `${payload.version.explanation}${warningText ? `\n${warningText}` : ""}`,
      },
    ]);
  }

  async function loadVersions() {
    const response = await fetch("/api/versions");
    if (!response.ok) return;
    const payload = (await response.json()) as { versions: VersionSnapshot[] };
    setVersions(payload.versions);

    if (payload.versions.length && !activeVersionId) {
      setActiveVersionId(payload.versions[0].id);
      setCompareA(payload.versions[0].id);
      setCompareB(payload.versions[1]?.id ?? "");
      setCode(payload.versions[0].code);
      setExplanation(payload.versions[0].explanation);
    }
  }

  async function rollback(id: string) {
    const response = await fetch("/api/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { version: VersionSnapshot };
    setActiveVersionId(payload.version.id);
    setCode(payload.version.code);
    setExplanation(payload.version.explanation);
    await loadVersions();
  }

  async function replayGeneration(sourceVersionId: string) {
    if (isStreaming) return;
    setIsStreaming(true);
    try {
      const response = await fetch("/api/agent/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceVersionId }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as AgentResponse;
      applyAgentPayload(payload);
      setStreamStatus((prev) => [...prev, `Replay completed from ${sourceVersionId}`]);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <main className="h-screen p-3 md:p-4">
      <header className="app-header mb-3">
        <div>
          <h1 className="app-title">AI UI BUILDER</h1>
          <p className="app-subtitle">Deterministic interface generation and iterative UI editing</p>
        </div>
        <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "Light Theme" : "Dark Theme"}
        </button>
      </header>

      <div className="grid h-[calc(100%-5.2rem)] grid-cols-1 gap-3 xl:grid-cols-[340px_1fr_460px]">
        <section className="panel flex min-h-0 flex-col">
          <div className="panel-heading">
            <h2 className="section-title">Intent Chat</h2>
            <p className="section-subtitle">Streaming pipeline: Planner -&gt; Generator -&gt; Explainer</p>
            <p className="section-subtitle">{MODE_CONFIG[mode].helper}</p>
          </div>

          <div className="mb-3 flex gap-2">
            <ModeButton active={mode === "generate"} onClick={() => handleModeChange("generate")} label="Generate" />
            <ModeButton active={mode === "modify"} onClick={() => handleModeChange("modify")} label="Modify" />
            <ModeButton active={mode === "regenerate"} onClick={() => handleModeChange("regenerate")} label="Regenerate" />
          </div>

          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            className="intent-input h-28"
            placeholder={MODE_CONFIG[mode].welcome}
          />

          <button className="btn-primary mt-2" onClick={() => runAgent(mode)} disabled={isStreaming}>
            {isStreaming ? "Running..." : MODE_CONFIG[mode].runLabel}
          </button>

          <div className="surface-box mt-3">
            <div className="surface-label">Stream</div>
            <div className="max-h-24 overflow-auto text-xs">
              {streamStatus.map((s, idx) => (
                <div key={idx}>- {s}</div>
              ))}
              {streamingExplanation && (
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs">{streamingExplanation}</pre>
              )}
            </div>
          </div>

          <div className="surface-box mt-3 min-h-0 flex-1 space-y-2 overflow-auto">
            {chat.map((msg, idx) => (
              <div key={idx} className={`chat-bubble ${msg.role === "user" ? "chat-user" : "chat-assistant"}`}>
                <div className="chat-role">{msg.role}</div>
                <pre className="whitespace-pre-wrap font-sans text-sm">{msg.text}</pre>
              </div>
            ))}
          </div>
        </section>

        <section className="panel min-h-0">
          <h2 className="section-title mb-3">Live Preview</h2>
          <div className="surface-box h-[calc(100%-2rem)] overflow-auto p-4">
            <PreviewRenderer plan={previewPlan} />
          </div>
        </section>

        <section className="panel flex min-h-0 flex-col">
          <h2 className="section-title">Code + Versions + Analysis</h2>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="code-input mt-3 h-48"
            placeholder="Generated code appears here"
          />

          <InfoBlock title="Explanation" body={explanation} />
          <InfoBlock title="Agent Logs" body={logs.join("\n")} mono />
          <AnalysisPanel analysis={activeVersion?.analysis ?? null} />

          <div className="mt-3 flex items-center gap-2">
            <button className="btn-ghost" onClick={loadVersions}>
              Refresh History
            </button>
            <select className="select-input" value={compareA} onChange={(e) => setCompareA(e.target.value)}>
              <option value="">Diff A</option>
              {versions.map((v) => (
                <option key={`a-${v.id}`} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
            <select className="select-input" value={compareB} onChange={(e) => setCompareB(e.target.value)}>
              <option value="">Diff B</option>
              {versions.map((v) => (
                <option key={`b-${v.id}`} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </div>

          <div className="surface-box mt-2 max-h-28 overflow-auto font-mono text-[11px]">
            {diffLines.length ? (
              diffLines.map((line, idx) => (
                <div
                  key={`${idx}-${line.kind}`}
                  className={
                    line.kind === "added"
                      ? "diff-add"
                      : line.kind === "removed"
                        ? "diff-remove"
                        : "diff-same"
                  }
                >
                  {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}
                  {line.text}
                </div>
              ))
            ) : (
              <div className="diff-same">Select two versions to view diff.</div>
            )}
          </div>

          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto">
            {versions.map((v) => (
              <div key={v.id} className={`version-card ${activeVersionId === v.id ? "version-active" : ""}`}>
                <button
                  className="w-full text-left"
                  onClick={() => {
                    setActiveVersionId(v.id);
                    setCode(v.code);
                    setExplanation(v.explanation);
                  }}
                >
                  <div className="text-xs font-semibold">{v.id}</div>
                  <div className="text-[11px] opacity-80">{new Date(v.createdAt).toLocaleString()}</div>
                  <div className="mt-1 text-xs">
                    {v.action.toUpperCase()} | {v.intent}
                  </div>
                </button>
                <div className="mt-2 flex gap-2">
                  <button className="btn-ghost text-xs" onClick={() => rollback(v.id)}>
                    Rollback
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => replayGeneration(v.id)}>
                    Replay
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button className={`btn-mode ${active ? "btn-mode-active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function InfoBlock({ title, body, mono }: { title: string; body: string; mono?: boolean }) {
  return (
    <div className="surface-box mt-3 text-xs">
      <div className="font-semibold">{title}</div>
      <pre className={`mt-1 whitespace-pre-wrap text-xs ${mono ? "font-mono" : "font-sans"}`}>{body}</pre>
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: StaticAnalysisReport | null }) {
  if (!analysis) {
    return (
      <div className="surface-box mt-3 text-xs">
        No static analysis yet.
      </div>
    );
  }

  return (
    <div className="surface-box mt-3 text-xs">
      <div className="font-semibold">Static Analysis</div>
      <div className="mt-1">
        Score: <span className="font-semibold">{analysis.score}</span> | Lines: {analysis.metrics.lineCount} | JSX tags:{" "}
        {analysis.metrics.jsxCount} | Imports: {analysis.metrics.importCount}
      </div>
      <ul className="mt-2 space-y-1">
        {analysis.findings.map((f, idx) => (
          <li key={`${f.code}-${idx}`} className={f.level === "error" ? "analysis-error" : f.level === "warning" ? "analysis-warning" : "analysis-info"}>
            [{f.level}] {f.code}: {f.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildLineDiff(source: string, target: string): DiffLine[] {
  const a = source.split("\n");
  const b = target.split("\n");
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j] });
      j += 1;
    }
  }

  while (i < m) {
    out.push({ kind: "removed", text: a[i] });
    i += 1;
  }
  while (j < n) {
    out.push({ kind: "added", text: b[j] });
    j += 1;
  }

  return out;
}
