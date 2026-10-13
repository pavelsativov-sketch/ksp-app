import { ObjectId, type Filter } from "mongodb";
import { getDb, COL } from "./mongo";
import { SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS, type SchoolPermission, type SchoolRole } from "./school/role-matrix";

// Types
export interface SchoolDoc {
  _id?: ObjectId;
  name: string;
  code: string; // unique school code
  region: string;
  city: string;
  academic_year: string; // e.g. "2026-2027"
  settings: {
    language: 'ru' | 'kk';
    shifts: number; // 1 or 2
    grading_system: '5-point' | '10-point';
  };
  created_by: string; // user_id of creator
  created_at: Date;
  updated_at: Date;
}

export interface SchoolMemberDoc {
  _id?: ObjectId;
  school_id: string;
  user_id: string;
  role: SchoolRole;
  /** Explicit, school-scoped grants; legacy admin members receive no default permissions. */
  granted_permissions?: SchoolPermission[];
  full_name: string;
  subject?: string;
  joined_at: Date;
}

export interface StudentDoc {
  _id?: ObjectId;
  school_id: string;
  full_name: string;
  class_name: string; // e.g. "7А"
  class_grade: number; // 1-11
  gender: 'M' | 'F';
  birth_date?: string;
  iin_last4?: string; // last 4 digits only, for matching
  status: 'active' | 'transferred' | 'graduated';
  created_at: Date;
}

// Functions
export async function createSchool(
  data: Omit<SchoolDoc, '_id' | 'created_by' | 'created_at' | 'updated_at'>,
  userId: string,
  fullName = 'Директор',
): Promise<string> {
  const db = await getDb();
  const school: SchoolDoc = {
    ...data,
    code: data.code.trim().toUpperCase(),
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const result = await db.collection(COL.schools).insertOne(school);

  // Создатель становится директором с реальным именем.
  try {
    await db.collection(COL.schoolMembers).insertOne({
      school_id: result.insertedId.toString(),
      user_id: userId,
      role: 'director',
      full_name: fullName,
      joined_at: new Date(),
    });
    await db.collection(COL.schoolAuditEvents).insertOne({
      school_id: result.insertedId.toString(),
      actor_id: userId,
      target_user_id: userId,
      action: 'member.created',
      resource_type: 'school_member',
      resource_id: userId,
      next_role: 'director',
      created_at: new Date(),
    });
  } catch (error) {
    // Do not leave a school that has no director if membership creation fails.
    await db.collection(COL.schoolMembers).deleteOne({ school_id: result.insertedId.toString(), user_id: userId }).catch(() => undefined);
    await db.collection(COL.schools).deleteOne({ _id: result.insertedId }).catch(() => undefined);
    throw error;
  }

  return result.insertedId.toString();
}

export async function getSchoolById(id: string): Promise<SchoolDoc | null> {
  const db = await getDb();
  let objId;
  try {
    objId = new ObjectId(id);
  } catch {
    return null;
  }
  const school = await db.collection<SchoolDoc>(COL.schools).findOne({ _id: objId });
  return school;
}

export async function getUserSchools(userId: string): Promise<SchoolDoc[]> {
  const db = await getDb();
  const members = await db.collection<SchoolMemberDoc>(COL.schoolMembers).find({ user_id: userId }).toArray();
  const schoolIds = members.map(m => {
    try { return new ObjectId(m.school_id); } catch { return null; }
  }).filter((id): id is ObjectId => id !== null);

  if (schoolIds.length === 0) return [];

  return db.collection<SchoolDoc>(COL.schools).find({ _id: { $in: schoolIds } }).toArray();
}

export async function getSchoolMembers(schoolId: string): Promise<SchoolMemberDoc[]> {
  const db = await getDb();
  return db.collection<SchoolMemberDoc>(COL.schoolMembers).find({ school_id: schoolId }).toArray();
}

export async function addSchoolMember(
  schoolId: string,
  data: Omit<SchoolMemberDoc, '_id' | 'school_id' | 'joined_at'>,
  actorId = data.user_id,
): Promise<string> {
  const db = await getDb();
  const member = {
    ...data,
    granted_permissions: data.role === "admin"
      ? (data.granted_permissions ?? []).filter((permission) => !SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS.includes(permission))
      : [],
    school_id: schoolId,
    joined_at: new Date()
  };
  
  const result = await db.collection(COL.schoolMembers).insertOne(member);
  try {
    await db.collection(COL.schoolAuditEvents).insertOne({
      school_id: schoolId,
      actor_id: actorId,
      target_user_id: data.user_id,
      action: 'member.created',
      resource_type: 'school_member',
      resource_id: data.user_id,
      next_role: data.role,
      granted_permissions: data.granted_permissions ?? [],
      created_at: new Date(),
    });
  } catch (error) {
    await db.collection(COL.schoolMembers).deleteOne({ _id: result.insertedId }).catch(() => undefined);
    throw error;
  }
  return result.insertedId.toString();
}

export async function getSchoolStudents(
  schoolId: string,
  classFilter?: string,
  includeInactive = false,
  allowedClassNames?: readonly string[],
): Promise<StudentDoc[]> {
  const db = await getDb();
  const query: Filter<StudentDoc> = { school_id: schoolId };
  if (!includeInactive) query.status = { $in: ['active', null] } as unknown as StudentDoc['status'];
  if (classFilter) {
    if (allowedClassNames && !allowedClassNames.includes(classFilter)) return [];
    query.class_name = classFilter;
  } else if (allowedClassNames) {
    if (allowedClassNames.length === 0) return [];
    query.class_name = { $in: [...allowedClassNames] } as unknown as StudentDoc['class_name'];
  }
  return db.collection<StudentDoc>(COL.students).find(query).toArray();
}

/** Resolve only a class label needed for a subsequent permission check. */
export async function getSchoolStudentClass(schoolId: string, studentId: string, activeOnly = true): Promise<string | null> {
  if (!ObjectId.isValid(studentId)) return null;
  const db = await getDb();
  const student = await db.collection<StudentDoc>(COL.students).findOne(
    {
      _id: new ObjectId(studentId),
      school_id: schoolId,
      ...(activeOnly ? { $or: [{ status: "active" }, { status: { $exists: false } }] } : {}),
    },
    { projection: { class_name: 1, _id: 0 } },
  );
  return student?.class_name ?? null;
}

export async function addStudents(schoolId: string, students: Omit<StudentDoc, '_id' | 'school_id' | 'created_at'>[]): Promise<number> {
  const db = await getDb();
  if (students.length === 0) return 0;
  
  const docs = students.map(s => ({
    ...s,
    school_id: schoolId,
    created_at: new Date()
  }));

  const result = await db.collection(COL.students).insertMany(docs);
  return result.insertedCount;
}

export async function getSchoolClasses(schoolId: string): Promise<string[]> {
  const db = await getDb();
  const classes = await db.collection<StudentDoc>(COL.students).distinct('class_name', {
    school_id: schoolId,
    $or: [{ status: 'active' }, { status: { $exists: false } }],
  });
  return classes.sort();
}

const rolePriorities = {
  admin: 4,
  director: 3,
  deputy: 2,
  teacher: 1
};

export async function requireSchoolAccess(userId: string, schoolId: string, minRole?: SchoolRole): Promise<SchoolMemberDoc> {
  const db = await getDb();
  const member = await db.collection<SchoolMemberDoc>(COL.schoolMembers).findOne({ 
    school_id: schoolId, 
    user_id: userId 
  });
  
  if (!member) {
    throw new Error('Access denied: not a member of this school');
  }

  if (minRole) {
    const memberPriority = rolePriorities[member.role] || 0;
    const requiredPriority = rolePriorities[minRole] || 0;
    if (memberPriority < requiredPriority) {
      throw new Error('Access denied: insufficient role');
    }
  }

  return member;
}
