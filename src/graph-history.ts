import type { GameFile } from "./model";

const undoStacks = new Map<string, GameFile[]>();
const redoStacks = new Map<string, GameFile[]>();
const stack = (map: Map<string, GameFile[]>, id: string) => { const value = map.get(id) ?? []; map.set(id, value); return value; };
export function recordGraphHistory(file: GameFile) { stack(undoStacks, file.id).push(structuredClone(file)); stack(redoStacks, file.id).length = 0; if (stack(undoStacks, file.id).length > 50) stack(undoStacks, file.id).shift(); }
export function clearGraphHistory(id: string) { undoStacks.delete(id); redoStacks.delete(id); }
export function canUndoGraph(id: string) { return (undoStacks.get(id)?.length ?? 0) > 0; }
export function canRedoGraph(id: string) { return (redoStacks.get(id)?.length ?? 0) > 0; }
function restoreGraph(current: GameFile, snapshot: GameFile): GameFile {
  const simulationAdvanced = current.tick !== snapshot.tick;
  const before = new Map(current.nodes.map(n => [n.id, n]));
  const nodes = snapshot.nodes.map(n => {
    const live = before.get(n.id); if (!live) return n;
    const data = { ...n.data };
    if (simulationAdvanced) { data.balance = live.data.balance; data.level = live.data.level; }
    if (simulationAdvanced && (n.data.kind === "condition" || n.data.kind === "unlock" || n.data.kind === "prestige")) data.enabled = live.data.enabled;
    if (simulationAdvanced && n.data.kind === "prestige") { data.prestigeMultiplier = live.data.prestigeMultiplier; data.bonus = live.data.bonus; }
    return { ...n, data };
  });
  return { ...current, nodes, edges: structuredClone(snapshot.edges), revision: current.revision + 1, updatedAt: Date.now() };
}
export function undoGraph(file: GameFile) {
  const previous = stack(undoStacks, file.id).pop(); if (!previous) return null;
  stack(redoStacks, file.id).push(structuredClone(file)); return restoreGraph(file, previous);
}
export function redoGraph(file: GameFile) {
  const next = stack(redoStacks, file.id).pop(); if (!next) return null;
  stack(undoStacks, file.id).push(structuredClone(file)); return restoreGraph(file, next);
}
