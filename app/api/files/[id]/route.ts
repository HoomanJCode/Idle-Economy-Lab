import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { fileOperations, gameFiles, participants } from "../../../../db/schema";
import { appendOperation, currentRow, parseFile, saveSnapshot, validDocument } from "../_storage";

export const runtime = "edge";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const row = await currentRow(id);
  if (!row) return Response.json({ error: "Game file not found" }, { status: 404 });
  const file = parseFile(row.document);
  return file ? Response.json({ file: { ...file, remoteRevision: row.revision } }) : Response.json({ error: "Saved file is unreadable" }, { status: 500 });
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null) as { file?: unknown; baseRevision?: number } | null;
  if (!validDocument(payload?.file) || payload.file.id !== id || !Number.isInteger(payload?.baseRevision)) {
    return Response.json({ error: "A matching file and revision are required" }, { status: 400 });
  }
  const result = await saveSnapshot(id, payload.file, payload.baseRevision!);
  if (result.status === "saved") return Response.json({ file: result.current });
  if (result.status === "conflict") return Response.json({ error: "This file changed elsewhere. The latest revision was loaded.", file: result.current }, { status: 409 });
  if (result.status === "running") return Response.json({ error: "Pause the simulation before editing the graph", file: result.current }, { status: 423 });
  if (result.status === "missing") return Response.json({ error: "Game file not found" }, { status: 404 });
  return Response.json({ error: "Saved file is unreadable" }, { status: 500 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const db = getDb();
  const row = await currentRow(id);
  if (!row) return Response.json({ error: "Game file not found" }, { status: 404 });
  const current = parseFile(row.document);
  await db.delete(gameFiles).where(eq(gameFiles.id, id)).run();
  await db.delete(participants).where(eq(participants.fileId, id)).run();
  await appendOperation(db, id, row.revision + 1, JSON.stringify({ id, name: current?.name ?? "Deleted file" }), "delete");
  return Response.json({ deleted: id });
}
