const fs = require("fs");

if (fs.existsSync("src/lib/school.ts")) {
  let text = fs.readFileSync("src/lib/school.ts", "utf8");
  text = text.replace(/export async function getUserSchools.*?return schools;.*?}/s, `export async function getUserSchools(userId: string): Promise<SchoolDoc[]> {
  const db = await getDb();
  const memberships = await db.collection<SchoolMemberDoc>("school_members").find({ user_id: userId }).toArray();
  if (memberships.length === 0) return [];
  const schoolIds = memberships.map(m => new import("mongodb").ObjectId(m.school_id));
  const schools = await db.collection<SchoolDoc>("schools").find({ _id: { $in: schoolIds } }).toArray();
  return schools;
}`);
  fs.writeFileSync("src/lib/school.ts", text);
}