import { AgentLogEvent } from "@/types/agent";

export function createLogger() {
  const logs: AgentLogEvent[] = [];

  return {
    push(stage: AgentLogEvent["stage"], detail: string) {
      logs.push({ stage, detail, timestamp: new Date().toISOString() });
    },
    all() {
      return logs;
    },
  };
}
