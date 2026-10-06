import Link from "next/link";
import { ArrowRight, PenLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./form";

export default function RegisterPage() {
  return <div className="mx-auto grid min-h-[calc(100vh-11rem)] max-w-[1200px] items-start gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-12"><section className="lg:col-span-5"><p className="editorial-kicker">Первый урок</p><h1 className="editorial-display mt-4 text-5xl">Создайте место для своей педагогической практики.</h1><p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">Один аккаунт — чтобы сохранять планы, развивать удачные сценарии и спокойно готовиться к урокам.</p><PenLine className="mt-9 size-6 text-primary" /></section><Card className="lg:col-span-5 lg:col-start-8"><CardHeader><p className="editorial-kicker">Регистрация</p><CardTitle className="editorial-display mt-3 text-3xl">Создайте рабочий стол</CardTitle></CardHeader><CardContent><RegisterForm /><p className="mt-8 text-sm text-muted-foreground">Уже есть аккаунт? <Link className="editorial-link font-semibold" href="/login">Войти <ArrowRight className="inline size-3.5" /></Link></p></CardContent></Card></div>;
}
