import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { participants } from "../../../../../db/schema";

export const runtime = "edge";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id: fileId } = await context.params;
  const db = getDb();
  const rows = await db.select().from(participants).where(and(
    eq(participants.fileId, fileId), gt(participants.lastSeen, Date.now() - 15000),
  )).limit(24);
  return Response.json({ participants: rows });
}

export async function POST(request: Request, context: Context) {
  const { id: fileId } = await context.params;
  const body = await request.json().catch(() => null) as {
    id?: string; name?: string; color?: string; cursorX?: number | null; cursorY?: number | null;
  } | null;
  if (!body || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.id ?? "") ||
      typeof body.name !== "string" || body.name.trim().length < 1 || body.name.length > 40 ||
      !/^#[0-9a-fA-F]{6}$/.test(body.color ?? "")) {
    return Response.json({ error: "A participant ID, display name, and color are required" }, { status: 400 });
  }
  const cx = Number.isFinite(body.cursorX) ? Math.max(-100000, Math.min(100000, body.cursorX!)) : null;
  const cy = Number.isFinite(body.cursorY) ? Math.max(-100000, Math.min(100000, body.cursorY!)) : null;
  const db = getDb();
  const participant = {
    id: `${fileId}:${body.id}`,
    fileId,
    name: body.name.trim(),
    color: body.color!,
    cursorX: body.cursorX === undefined ? undefined : cx,
    cursorY: body.cursorY === undefined ? undefined : cy,
    lastSeen: Date.now(),
  };
  await db.insert(participants).values(participant).onConflictDoUpdate({
    target: participants.id,
    set: { name: participant.name, color: participant.color, ...(body.cursorX === undefined ? {} : { cursorX: cx }), ...(body.cursorY === undefined ? {} : { cursorY: cy }), lastSeen: participant.lastSeen },
  }).run();
  return Response.json({ participant });
}
