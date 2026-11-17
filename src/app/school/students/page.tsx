import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school/active";
import { getTeacherJournalAnalytics } from "@/lib/journal";
import { NoSchool } from "@/components/school/no-school";
import { PersonalStudentsView } from "@/components/school/personal-school-views";
import { StudentsClient } from "@/components/school/students-client";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return <NoSchool />;
  const school = await getActiveSchool(user.id);
  if (!school || !school._id) {
    const [personal, params] = await Promise.all([
      getTeacherJournalAnalytics(user.id),
      searchParams,
    ]);
    return <PersonalStudentsView initialData={personal} initialClassFilter={params.class ?? ""} />;
  }
  return <StudentsClient schoolId={school._id.toString()} />;
}
