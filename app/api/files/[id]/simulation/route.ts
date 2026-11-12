import { advanceOffline, advanceTicks, buyUpgrade, mine, resetSimulation, step, triggerPrestige } from "../../../../../src/engine";
import type { GameFile } from "../../../../../src/model";
import { currentRow, parseFile, saveSnapshot } from "../../_storage";

export const runtime = "edge";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { command?: string; nodeId?: string; expectedTick?: number; baseRevision?: number; value?: number | string } | null;
  if (!body) return Response.json({ error: "A simulation command is required" }, { status: 400 });
  const row = await currentRow(id);
  if (!row) return Response.json({ error: "Game file not found" }, { status: 404 });
  const current = parseFile(row.document);
  if (!current) return Response.json({ error: "Saved file is unreadable" }, { status: 500 });
  if (body?.baseRevision !== row.revision || body.expectedTick !== current.tick) return Response.json({ error: "The shared simulation advanced. The latest state was loaded.", file: { ...current, remoteRevision: row.revision } }, { status: 409 });

  let next: GameFile = structuredClone(current);
  switch (body.command) {
    case "play": next.running = true; break;
    case "pause": next.running = false; break;
    case "reset": next = resetSimulation(next); break;
    case "speed": if ([1, 10, 100, 1000].includes(Number(body.value))) next.speed = Number(body.value); else return Response.json({ error: "Unsupported simulation speed" }, { status: 400 }); break;
    case "mode": if (["Manual", "Automated", "Hybrid"].includes(String(body.value))) next.mode = body.value as GameFile["mode"]; else return Response.json({ error: "Unsupported player mode" }, { status: 400 }); break;
    case "offlineCap": if ([0, 3600, 14400, 28800, 86400].includes(Number(body.value))) next.offlineCapSeconds = Number(body.value); else return Response.json({ error: "Unsupported offline cap" }, { status: 400 }); break;
    case "offline": {
      next=advanceOffline(next,Date.now()-row.updatedAt).file;
      break;
    }
    case "step": if (next.running) return Response.json({ error: "Pause before stepping" }, { status: 423 }); next = step(next); break;
    case "tick": if (!next.running) break; next=advanceTicks(next,next.speed); next.running = true; break;
    case "mine": if (body.nodeId) next = mine(next, body.nodeId); break;
    case "upgrade": if (body.nodeId) next = buyUpgrade(next, body.nodeId); break;
    case "prestige": if (body.nodeId) next = triggerPrestige(next, body.nodeId); break;
    default: return Response.json({ error: "Unknown simulation command" }, { status: 400 });
  }
  const saved = await saveSnapshot(id, next, row.revision, true);
  if (saved.status === "saved") return Response.json({ file: saved.current });
  return Response.json({ error: "The shared state changed during this command.", file: saved.current }, { status: 409 });
}
