import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getCurriculumProgress } from "@/lib/school-analytics";
import { NoSchool } from "@/components/school/no-school";
import { CurriculumManager } from "@/components/school/curriculum-manager";

export const dynamic = "force-dynamic";

export default async function CurriculumPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school?._id) return <NoSchool />;

  const rows = await getCurriculumProgress(school._id.toString());
  const plans = rows.flatMap((plan) => plan._id ? [{
    id: plan._id.toString(),
    subject: plan.subject,
    class_name: plan.class_name,
    academic_year: plan.academic_year,
    total_hours: plan.total_hours,
    lessons: plan.lessons,
  }] : []);
  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-8 md:px-6">
    <header><p className="editorial-kicker">Планирование</p><h1 className="editorial-display mt-1 text-3xl">КТП</h1><p className="mt-1 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p></header>
    <CurriculumManager schoolId={school._id.toString()} initialPlans={plans} academicYear={school.academic_year} />
  </main>;
}
