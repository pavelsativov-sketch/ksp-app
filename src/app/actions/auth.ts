"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email({ error: "Некорректный email" }),
  password: z.string().min(6, "Пароль минимум 6 символов"),
});

const registerSchema = z.object({
  email: z.email({ error: "Некорректный email" }),
  password: z.string().min(6, "Пароль минимум 6 символов"),
  fullName: z.string().trim().min(2, "Укажите имя"),
});

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function loginAction(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fe[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors: fe };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function registerAction(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fe[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors: fe };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });
  if (error) return { error: error.message };

  // If email confirmation is required, session will be null.
  if (!data.session) {
    return {
      error:
        "Проверьте почту: мы отправили письмо для подтверждения. После подтверждения войдите по паролю.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
