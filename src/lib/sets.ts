import type { SetData } from "../types";

const setModules = import.meta.glob<SetData>("../../data/*.json", {
  eager: true,
  import: "default",
});

const sets: Map<string, SetData> = new Map();

for (const [path, data] of Object.entries(setModules)) {
  const code = path.match(/\/(\w+)\.json$/)?.[1];
  if (code && data) {
    sets.set(code, data);
  }
}

export function getSet(code: string): SetData | undefined {
  return sets.get(code);
}

export function getAllSets(): SetData[] {
  return [...sets.values()].sort(
    (a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime(),
  );
}
