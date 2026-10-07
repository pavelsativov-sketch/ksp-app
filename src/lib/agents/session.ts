import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";

function validUserId(userId: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(userId)) throw new Error("Некорректный пользователь агента");
  return new ObjectId(userId);
}

/** Current owner of the authenticated workspace controls. */
export async function getControlOwner(userId: string): Promise<"user" | "ai"> {
  const row = await (await getDb()).collection(COL.agentControls).findOne(
    { user_id: validUserId(userId) },
    { projection: { owner: 1 } },
  );
  return row?.owner === "user" ? "user" : "ai";
}

export async function setControlOwner(userId: string, owner: "user" | "ai"): Promise<void> {
  const now = new Date();
  await (await getDb()).collection(COL.agentControls).updateOne(
    { user_id: validUserId(userId) },
    { $set: { owner, updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true },
  );
}

/** Pause agent work while the account owner controls the shared workspace. */
export async function waitForControl(userId: string, isStopped: () => Promise<boolean>): Promise<"resumed" | "stopped"> {
  for (;;) {
    if (await isStopped()) return "stopped";
    if (await getControlOwner(userId) === "ai") return "resumed";
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}
