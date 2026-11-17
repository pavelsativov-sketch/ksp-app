import { StatusLink, StatusScene } from "@/components/status/status-scene";

export const metadata = { title: "Страница не найдена — Mekty" };

export default function NotFound() {
  return (
    <StatusScene
      kind="not-found"
      title="Эта страница улетела"
      lead="Ссылка устарела или в адресе опечатка. Уроки и материалы на месте: начните с главной или откройте свои уроки."
    >
      <StatusLink href="/dashboard" primary>На главную</StatusLink>
      <StatusLink href="/plans">Мои уроки</StatusLink>
      <StatusLink href="/library">Библиотека</StatusLink>
    </StatusScene>
  );
}
