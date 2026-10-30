import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const previewWorkspaces = sqliteTable("preview_workspaces", {
  userId: text("user_id").primaryKey(),
  state: text("state").notNull(),
  version: integer("version").notNull().default(0),
  lastRequestId: text("last_request_id"),
  updatedAt: text("updated_at").notNull(),
});
export const previewRequests = sqliteTable(
  "preview_requests",
  {
    userId: text("user_id").notNull(),
    requestId: text("request_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    result: text("result").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.requestId] })],
);
