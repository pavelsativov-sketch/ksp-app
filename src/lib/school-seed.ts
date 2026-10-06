import { getDb, COL } from "./mongo";
import { ObjectId } from "mongodb";
import { StudentDoc, SchoolMemberDoc } from "./school";
import { AttendanceRecord, GradeRecord, CurriculumDoc, VskInspection } from "./school-analytics";

const FIRST_NAMES = ["Азамат", "Динара", "Руслан", "Айгерим", "Тимур", "Мадина", "Ерлан", "Асель", "Нурлан", "Зарина"];
const LAST_NAMES = ["Ахметов", "Оспанова", "Ибрагимов", "Сулейменова", "Смагулов", "Алиева", "Калиев", "Садирова", "Искаков", "Кудайбергенова"];
const SUBJECTS = ["Математика", "Физика", "Химия", "Биология", "История", "География", "Информатика", "Казахский язык", "Русский язык", "Английский язык"];

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomName() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

export async function generateDemoSchoolData(schoolId: string, directorId: string) {
  const db = await getDb();
  
  // Create 30 teachers
  const teachers: SchoolMemberDoc[] = [];
  for (let i = 0; i < 30; i++) {
    const teacher: SchoolMemberDoc = {
      school_id: schoolId,
      user_id: new ObjectId().toString(),
      role: 'teacher',
      full_name: getRandomName(),
      subject: SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)],
      joined_at: new Date()
    };
    teachers.push(teacher);
  }
  await db.collection(COL.schoolMembers).insertMany(teachers);

  // Create 20 classes
  const classes = [];
  for (let grade = 1; grade <= 10; grade++) {
    classes.push(`${grade}А`);
    classes.push(`${grade}Б`);
  }

  // Create 500 students
  const students: StudentDoc[] = [];
  for (let i = 0; i < 500; i++) {
    const className = classes[Math.floor(Math.random() * classes.length)];
    const grade = parseInt(className.replace(/\D/g, ''));
    const student: StudentDoc = {
      school_id: schoolId,
      full_name: getRandomName(),
      class_name: className,
      class_grade: grade,
      gender: Math.random() > 0.5 ? 'M' : 'F',
      status: 'active',
      created_at: new Date()
    };
    students.push(student);
  }
  await db.collection(COL.students).insertMany(students);
  const insertedStudents = await db.collection<StudentDoc>(COL.students).find({ school_id: schoolId }).toArray();

  // Create attendance
  const attendance: AttendanceRecord[] = [];
  for (const student of insertedStudents) {
    // Generate some attendance records
    for (let day = 1; day <= 10; day++) {
      let status: 'present' | 'absent_excused' | 'absent_unexcused' | 'late' = 'present';
      
      // Pattern: 9А declining attendance, 8Б chronic absences
      if (student.class_name === '9А' && Math.random() > 0.7) status = 'absent_unexcused';
      if (student.class_name === '8Б' && Math.random() > 0.6) status = 'absent_excused';
      
      attendance.push({
        school_id: schoolId,
        student_id: student._id.toString(),
        student_name: student.full_name,
        class_name: student.class_name,
        date: `2026-09-${day.toString().padStart(2, '0')}`,
        status,
        recorded_by: directorId,
        created_at: new Date()
      });
    }
  }
  await db.collection(COL.attendance).insertMany(attendance);

  // Grades for Quarter 1
  const grades: GradeRecord[] = [];
  for (const student of insertedStudents) {
    const gradeDoc: GradeRecord = {
      school_id: schoolId,
      student_id: student._id.toString(),
      student_name: student.full_name,
      class_name: student.class_name,
      subject: 'Математика',
      teacher_id: teachers[0].user_id,
      quarter: 1,
      type: 'sor',
      score: student.class_name === '8Б' ? getRandomInt(5, 12) : getRandomInt(10, 15),
      max_score: 15,
      date: '2026-09-15',
      created_at: new Date()
    };
    grades.push(gradeDoc);
  }
  await db.collection(COL.schoolGrades).insertMany(grades);

  // Curriculum progress
  const curriculum: CurriculumDoc = {
    school_id: schoolId,
    teacher_id: teachers[0].user_id,
    subject: 'Информатика',
    class_name: '7А',
    academic_year: '2026-2027',
    total_hours: 34,
    lessons: [
      { number: 1, topic: 'Введение', planned_date: '2026-09-01', status: 'completed' },
      { number: 2, topic: 'Устройство ПК', planned_date: '2026-09-08', status: 'completed' },
      { number: 3, topic: 'Алгоритмы', planned_date: '2026-09-15', status: 'rescheduled' }
    ],
    created_at: new Date(),
    updated_at: new Date()
  };
  await db.collection(COL.curriculum).insertOne(curriculum);

  // VSK Inspections
  const inspections: VskInspection[] = [];
  for (let i = 0; i < 5; i++) {
    inspections.push({
      school_id: schoolId,
      inspector_id: directorId,
      inspector_name: 'Демо Директор',
      teacher_id: teachers[i].user_id,
      teacher_name: teachers[i].full_name,
      subject: teachers[i].subject ?? '',
      class_name: classes[i],
      date: `2026-09-${(i+10).toString()}`,
      direction: 'Посещение урока',
      checklist: [{ criterion: 'Структура урока', score: getRandomInt(3, 5), max_score: 5 }],
      overall_score: getRandomInt(60, 95),
      findings: 'Урок проведен на хорошем уровне',
      recommendations: 'Использовать больше интерактива',
      status: 'completed',
      created_at: new Date()
    });
  }
  await db.collection(COL.vskInspections).insertMany(inspections);
}
