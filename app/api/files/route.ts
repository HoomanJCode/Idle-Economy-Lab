import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { gameFiles } from "../../../db/schema";
import { appendOperation, latestOperationId, parseFile, validDocument } from "./_storage";

export const runtime = "edge";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(gameFiles).orderBy(desc(gameFiles.updatedAt)).limit(200);
    const files = rows.flatMap(row => {
      const document = parseFile(row.document);
      return document ? [{ ...document, remoteRevision: row.revision }] : [];
    });
    return Response.json({ files, cursor: await latestOperationId(db) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load game files" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { file?: unknown } | null;
  const file = payload?.file;
  if (!validDocument(file)) return Response.json({ error: "A valid game file is required" }, { status: 400 });
  const db = getDb();
  const now = Date.now();
  const saved = { ...file, name: file.name.trim(), remoteRevision: 1, updatedAt: now };
  try {
    await db.insert(gameFiles).values({
      id: file.id, title: saved.name, document: JSON.stringify(saved), revision: 1,
      createdAt: now, updatedAt: now,
    }).run();
    await appendOperation(db, file.id, 1, JSON.stringify(saved));
    return Response.json({ file: saved }, { status: 201 });
  } catch {
    const [existing] = await db.select().from(gameFiles).where(eq(gameFiles.id, file.id)).limit(1);
    if (existing) return Response.json({ error: "That file already exists" }, { status: 409 });
    return Response.json({ error: "Could not create game file" }, { status: 503 });
  }
}
