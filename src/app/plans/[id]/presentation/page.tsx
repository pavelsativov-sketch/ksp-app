import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPlanById } from "@/lib/plans-repo";
import { DeckBuilder } from "@/components/ksp/deck-builder";

export const dynamic = "force-dynamic";

export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/plans/${id}/presentation`);
  const plan = await getPlanById(id);
  if (!plan) notFound();
  if (plan.owner_id !== user.id) redirect(`/plans/${plan.id}`);
  return <DeckBuilder planId={plan.id} topic={plan.content.topic || plan.title} />;
}
