"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { deleteKit } from "@/lib/kits";

export interface KitFormState {
  error?: string;
  info?: string;
}

const empty: KitFormState = {};

export async function deleteKitAction(_: KitFormState, formData: FormData): Promise<KitFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const result = await deleteKit(user.id, String(formData.get("kitId") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/kits");
  return empty;
}
