import { VersionSnapshot } from "@/types/agent";

class VersionStore {
  private versions: VersionSnapshot[] = [];

  list(): VersionSnapshot[] {
    return [...this.versions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  latest(): VersionSnapshot | null {
    return this.versions.length ? this.versions[this.versions.length - 1] : null;
  }

  get(id: string): VersionSnapshot | null {
    return this.versions.find((v) => v.id === id) ?? null;
  }

  add(snapshot: Omit<VersionSnapshot, "id" | "createdAt">): VersionSnapshot {
    const version: VersionSnapshot = {
      ...snapshot,
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.versions.push(version);
    return version;
  }

  rollback(id: string): VersionSnapshot | null {
    return this.get(id);
  }
}

const globalStore = globalThis as typeof globalThis & { __versionStore?: VersionStore };

export const versionStore = globalStore.__versionStore ?? new VersionStore();
globalStore.__versionStore = versionStore;
