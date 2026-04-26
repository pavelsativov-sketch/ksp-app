import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LoginForm } from "./form";

export default function LoginPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Вход</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <p className="text-sm text-slate-500 mt-6 text-center">
            Нет аккаунта?{" "}
            <Link className="text-blue-600 hover:underline" href="/register">
              Зарегистрируйтесь
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
