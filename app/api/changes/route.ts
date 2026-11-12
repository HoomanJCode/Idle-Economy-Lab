import { asc, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { fileOperations } from "../../../db/schema";

export const runtime = "edge";

export async function GET(request: Request) {
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after") ?? 0));
  if (!Number.isFinite(after)) return Response.json({ error: "Invalid change cursor" }, { status: 400 });
  const db = getDb();
  const changes = await db.select().from(fileOperations)
    .where(gt(fileOperations.id, Math.floor(after)))
    .orderBy(asc(fileOperations.id)).limit(100);
  return Response.json({ changes, cursor: changes.at(-1)?.id ?? Math.floor(after) });
}
