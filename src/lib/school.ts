import { ObjectId, type Filter } from "mongodb";
import { getDb, COL } from "./mongo";

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
  role: 'director' | 'deputy' | 'teacher' | 'admin';
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
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const result = await db.collection(COL.schools).insertOne(school);

  // Создатель становится директором с реальным именем.
  await db.collection(COL.schoolMembers).insertOne({
    school_id: result.insertedId.toString(),
    user_id: userId,
    role: 'director',
    full_name: fullName,
    joined_at: new Date(),
  });

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

export async function addSchoolMember(schoolId: string, data: Omit<SchoolMemberDoc, '_id' | 'school_id' | 'joined_at'>): Promise<string> {
  const db = await getDb();
  const member = {
    ...data,
    school_id: schoolId,
    joined_at: new Date()
  };
  
  const result = await db.collection(COL.schoolMembers).insertOne(member);
  return result.insertedId.toString();
}

export async function getSchoolStudents(schoolId: string, classFilter?: string): Promise<StudentDoc[]> {
  const db = await getDb();
  const query: Filter<StudentDoc> = { school_id: schoolId };
  if (classFilter) {
    query.class_name = classFilter;
  }
  return db.collection<StudentDoc>(COL.students).find(query).toArray();
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
  const classes = await db.collection<StudentDoc>(COL.students).distinct('class_name', { school_id: schoolId });
  return classes.sort();
}

const rolePriorities = {
  admin: 4,
  director: 3,
  deputy: 2,
  teacher: 1
};

export async function requireSchoolAccess(userId: string, schoolId: string, minRole?: 'director' | 'deputy' | 'teacher' | 'admin'): Promise<SchoolMemberDoc> {
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
