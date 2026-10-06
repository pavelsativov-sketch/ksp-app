import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env.local") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI not set.");
  process.exit(1);
}

const FIRST_NAMES = ["Азамат", "Динара", "Руслан", "Айгерим", "Тимур", "Мадина", "Ерлан", "Асель", "Нурлан", "Зарина"];
const LAST_NAMES = ["Ахметов", "Оспанова", "Ибрагимов", "Сулейменова", "Смагулов", "Алиева", "Калиев", "Садирова", "Искаков", "Кудайбергенова"];
const SUBJECTS = ["Математика", "Физика", "Химия", "Биология", "История", "География", "Информатика", "Казахский язык", "Русский язык", "Английский язык"];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomName() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "ksp");
    console.log("Connected to MongoDB.");

    // Create user
    const email = "demo@school25.kz";
    let user = await db.collection("users").findOne({ email });
    if (!user) {
      const passwordHash = await bcrypt.hash("demo123", 10);
      const res = await db.collection("users").insertOne({
        email,
        password: passwordHash,
        name: "Демо Директор",
        created_at: new Date(),
        updated_at: new Date()
      });
      user = { _id: res.insertedId };
      console.log(`Created user ${email}`);
    } else {
      console.log(`User ${email} already exists.`);
    }

    // Create school
    const schoolData = {
      name: "Школа №25",
      code: "SCH25-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      region: "Костанайская область",
      city: "Костанай",
      academic_year: "2026-2027",
      settings: {
        language: "ru",
        shifts: 2,
        grading_system: "10-point"
      },
      created_by: user._id.toString(),
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const schoolRes = await db.collection("schools").insertOne(schoolData);
    const schoolId = schoolRes.insertedId.toString();
    console.log(`Created school ${schoolData.name} (${schoolId})`);

    // Add user as director
    await db.collection("school_members").insertOne({
      school_id: schoolId,
      user_id: user._id.toString(),
      role: 'director',
      full_name: 'Демо Директор',
      joined_at: new Date()
    });

    // Create teachers
    const teachers = [];
    for (let i = 0; i < 30; i++) {
      teachers.push({
        school_id: schoolId,
        user_id: new ObjectId().toString(),
        role: 'teacher',
        full_name: getRandomName(),
        subject: SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)],
        joined_at: new Date()
      });
    }
    await db.collection("school_members").insertMany(teachers);
    console.log(`Created 30 teachers`);

    // Create classes and students
    const classes = [];
    for (let grade = 1; grade <= 10; grade++) {
      classes.push(`${grade}А`);
      classes.push(`${grade}Б`);
    }

    const students = [];
    for (let i = 0; i < 500; i++) {
      const className = classes[Math.floor(Math.random() * classes.length)];
      const grade = parseInt(className.replace(/\D/g, ''));
      students.push({
        school_id: schoolId,
        full_name: getRandomName(),
        class_name: className,
        class_grade: grade,
        gender: Math.random() > 0.5 ? 'M' : 'F',
        status: 'active',
        created_at: new Date()
      });
    }
    await db.collection("students").insertMany(students);
    const insertedStudents = await db.collection("students").find({ school_id: schoolId }).toArray();
    console.log(`Created 500 students`);

    // Create attendance
    const attendance = [];
    for (const student of insertedStudents) {
      for (let day = 1; day <= 10; day++) {
        let status = 'present';
        if (student.class_name === '9А' && Math.random() > 0.7) status = 'absent_unexcused';
        if (student.class_name === '8Б' && Math.random() > 0.6) status = 'absent_excused';
        
        attendance.push({
          school_id: schoolId,
          student_id: student._id.toString(),
          student_name: student.full_name,
          class_name: student.class_name,
          date: `2026-09-${day.toString().padStart(2, '0')}`,
          status,
          recorded_by: user._id.toString(),
          created_at: new Date()
        });
      }
    }
    await db.collection("attendance").insertMany(attendance);
    console.log(`Created attendance records`);

    // Create grades
    const grades = [];
    for (const student of insertedStudents) {
      grades.push({
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
      });
    }
    await db.collection("school_grades").insertMany(grades);
    console.log(`Created grades`);

    // Curriculum
    await db.collection("curriculum").insertOne({
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
    });
    console.log(`Created curriculum`);

    // VSK Inspections
    const inspections = [];
    for (let i = 0; i < 5; i++) {
      inspections.push({
        school_id: schoolId,
        inspector_id: user._id.toString(),
        inspector_name: 'Демо Директор',
        teacher_id: teachers[i].user_id,
        teacher_name: teachers[i].full_name,
        subject: teachers[i].subject,
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
    await db.collection("vsk_inspections").insertMany(inspections);
    console.log(`Created 5 VSK inspections`);

    console.log("Seeding complete!");
  } catch (error) {
    console.error("Error seeding:", error);
  } finally {
    await client.close();
  }
}

run();
