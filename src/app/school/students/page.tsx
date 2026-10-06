import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school/active";
import { NoSchool } from "@/components/school/no-school";
import { StudentsClient } from "@/components/school/students-client";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school || !school._id) return <NoSchool />;
  return <StudentsClient schoolId={school._id.toString()} />;
}
