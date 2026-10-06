"use client";

import Link from "next/link";

export default function GlobalError({ unstable_retry, reset }: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset: () => void;
}) {
  return <html lang="ru"><body style={{ margin: 0, background: "#f8fbff", color: "#172447", fontFamily: "Arial, sans-serif" }}>
    <title>Временная ошибка — Mekty</title>
    <main role="alert" style={{ maxWidth: 600, margin: "12vh auto", padding: 24, textAlign: "center" }}>
      <p style={{ color: "#4263eb", fontWeight: 700 }}>Mekty</p>
      <h1>Сервис временно недоступен</h1>
      <p style={{ lineHeight: 1.7 }}>Не удалось загрузить приложение. Попробуйте ещё раз через несколько секунд.</p>
      <button onClick={() => (unstable_retry ?? reset)()} style={{ padding: "14px 24px", border: 0, borderRadius: 14, background: "#4263eb", color: "white", fontSize: 16, cursor: "pointer" }}>Попробовать снова</button>
      <p><Link href="/" style={{ color: "#4263eb" }}>На главную</Link></p>
    </main>
  </body></html>;
}
