import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { fileOperations, gameFiles } from "../../../db/schema";
import { connectionLabel, type GameFile } from "../../../src/model";

export type StorageDb = ReturnType<typeof getDb>;

export function parseFile(document: string): GameFile | null {
  try {
    const value = JSON.parse(document) as GameFile;
    return value && typeof value.id === "string" && Array.isArray(value.nodes) && Array.isArray(value.edges)
      ? value
      : null;
  } catch {
    return null;
  }
}

export async function currentRow(id: string) {
  const db = getDb();
  const [row] = await db.select().from(gameFiles).where(eq(gameFiles.id, id)).limit(1);
  return row ?? null;
}

export async function latestOperationId(db: StorageDb) {
  const [row] = await db.select({ id: fileOperations.id }).from(fileOperations)
    .orderBy(desc(fileOperations.id)).limit(1);
  return row?.id ?? 0;
}

export async function appendOperation(
  db: StorageDb,
  fileId: string,
  revision: number,
  document: string,
  operation: "upsert" | "delete" = "upsert",
) {
  await db.insert(fileOperations).values({ fileId, revision, document, operation, createdAt: Date.now() }).run();
}

export function validDocument(value: unknown): value is GameFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<GameFile>;
  if(typeof file.id!=="string"||file.id.length>80||typeof file.name!=="string"||!file.name.trim()||file.name.length>120||!Array.isArray(file.nodes)||!Array.isArray(file.edges)||file.nodes.length>500||file.edges.length>2000||!Number.isSafeInteger(file.tick)||file.tick!<0||!Number.isSafeInteger(file.revision)||file.revision!<0||![1,10,100,1000].includes(file.speed!)||!['Manual','Automated','Hybrid'].includes(file.mode!)||typeof file.running!=="boolean"||!Number.isFinite(file.updatedAt)||!Array.isArray(file.history)||file.history.length>1000||!Array.isArray(file.runs)||file.runs.length>12||!Array.isArray(file.events)||file.events.length>80||(file.offlineCapSeconds!==undefined&&![0,3600,14400,28800,86400].includes(file.offlineCapSeconds))||(file.offlineRemainderMs!==undefined&&(!Number.isFinite(file.offlineRemainderMs)||file.offlineRemainderMs<0||file.offlineRemainderMs>86400000)))return false;
  const nodes=file.nodes as GameFile["nodes"],edges=file.edges as GameFile["edges"],byId=new Map<string,GameFile["nodes"][number]>(),kinds=new Set(["resource","generator","manual","upgrade","converter","automation","multiplier","condition","unlock","prestige","limiter","group"]);
  const decimal=/^-?(?:\d{1,80}(?:\.\d{0,40})?|\.\d{1,40})(?:e[+-]?\d{1,4})?$/i,decimalFields=["balance","initial","capacity","rate","cost","threshold","inputAmount"] as const,nonnegative=new Set(["balance","initial","capacity","rate","cost","threshold","inputAmount"]);
  for(const node of nodes){
    if(!node||typeof node.id!=="string"||node.id.length>80||byId.has(node.id)||!node.data||!kinds.has(node.data.kind)||typeof node.data.title!=="string"||!node.data.title.trim()||node.data.title.length>120||typeof node.data.description!=="string"||node.data.description.length>1000||!Number.isFinite(node.position?.x)||!Number.isFinite(node.position?.y)||Math.abs(node.position.x)>1_000_000||Math.abs(node.position.y)>1_000_000)return false;
    if(node.style&&((node.style.width!==undefined&&(!Number.isFinite(Number(node.style.width))||Number(node.style.width)<50||Number(node.style.width)>10000))||(node.style.height!==undefined&&(!Number.isFinite(Number(node.style.height))||Number(node.style.height)<50||Number(node.style.height)>10000))))return false;
    for(const field of decimalFields){const v=node.data[field];if(v===undefined)continue;const raw=String(v);if(raw.length>100||!decimal.test(raw)||(nonnegative.has(field)&&raw.startsWith("-")))return false;}
    for(const field of ["growth","bonus","ratio","interval","level","maxLevel","prestigeGrowth"] as const){const n=node.data[field];if(n!==undefined&&(!Number.isFinite(n)||Math.abs(n)>1_000_000_000))return false;}
    if((node.data.growth!==undefined&&node.data.growth<1)||(node.data.interval!==undefined&&node.data.interval<1)||(node.data.ratio!==undefined&&node.data.ratio<0)||(node.data.level!==undefined&&node.data.level<0)||(node.data.maxLevel!==undefined&&node.data.maxLevel<0)||(node.data.prestigeGrowth!==undefined&&node.data.prestigeGrowth<1))return false;
    if((node.data.interval!==undefined&&!Number.isSafeInteger(node.data.interval))||(node.data.level!==undefined&&!Number.isSafeInteger(node.data.level))||(node.data.maxLevel!==undefined&&!Number.isSafeInteger(node.data.maxLevel)))return false;
    if(node.parentId&&node.parentId===node.id)return false;
    byId.set(node.id,node);
  }
  for(const node of nodes){let parent=node.parentId;const seen=new Set([node.id]);while(parent){const container=byId.get(parent);if(!container||container.data.kind!=="group"||seen.has(parent))return false;seen.add(parent);parent=container.parentId;}}
  for(const edge of edges){const source=byId.get(edge.source),target=byId.get(edge.target);if(!source||!target||source.id===target.id||!connectionLabel(source.data.kind,target.data.kind))return false;}
  return true;
}

export async function saveSnapshot(
  id: string,
  document: GameFile,
  expectedRevision: number,
  allowRunningEdit = false,
) {
  const db = getDb();
  const [row] = await db.select().from(gameFiles).where(eq(gameFiles.id, id)).limit(1);
  if (!row) return { status: "missing" as const, current: null };
  const current = parseFile(row.document);
  if (!current) return { status: "corrupt" as const, current: null };
  if (row.revision !== expectedRevision) return { status: "conflict" as const, current: { ...current, remoteRevision: row.revision } };
  if (!allowRunningEdit && current.running &&
      (JSON.stringify(current.nodes) !== JSON.stringify(document.nodes) || JSON.stringify(current.edges) !== JSON.stringify(document.edges))) {
    return { status: "running" as const, current: { ...current, remoteRevision: row.revision } };
  }
  const revision = row.revision + 1;
  const saved: GameFile = { ...document, revision: Math.max(document.revision, current.revision) + 1, remoteRevision: revision, updatedAt: Date.now() };
  const serialized = JSON.stringify(saved);
  const changed = await db.update(gameFiles).set({
    title: saved.name.trim(), document: serialized, revision, updatedAt: saved.updatedAt,
  }).where(and(eq(gameFiles.id, id), eq(gameFiles.revision, expectedRevision))).returning({ id: gameFiles.id });
  if (!changed.length) {
    const latest = await currentRow(id);
    const latestFile = latest ? parseFile(latest.document) : null;
    return { status: "conflict" as const, current: latestFile ? { ...latestFile, remoteRevision: latest!.revision } : null };
  }
  await appendOperation(db, id, revision, serialized);
  return { status: "saved" as const, current: saved };
}
