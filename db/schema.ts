import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameFiles = sqliteTable("game_files", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  document: text("document").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const fileOperations = sqliteTable("file_operations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileId: text("file_id").notNull(),
  revision: integer("revision").notNull(),
  document: text("document").notNull(),
  operation: text("operation").notNull().default("upsert"),
  createdAt: integer("created_at").notNull(),
});

export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  cursorX: real("cursor_x"),
  cursorY: real("cursor_y"),
  lastSeen: integer("last_seen").notNull(),
});
