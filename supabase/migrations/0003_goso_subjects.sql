-- Migration 0003: GOSO subjects + schema upgrade for objectives import.
-- Run after 0001_init.sql and 0002_seed.sql.
-- After this migration, run:  npm run seed:goso  (to import 19k+ objectives).

-- 1. Unique constraint on subjects.name_ru for idempotent upsert.
alter table public.subjects drop constraint if exists subjects_name_ru_unique;
alter table public.subjects add constraint subjects_name_ru_unique unique (name_ru);

-- 2. Upsert all subjects from official GOSO (RK).
insert into public.subjects (name_ru, name_kz, grade_min, grade_max) values
  ('Алгебра', null, 7, 9),
  ('Алгебра и начала анализа', null, 10, 11),
  ('Английский язык', null, 3, 11),
  ('Биология', null, 7, 11),
  ('Всемирная история', null, 5, 11),
  ('География', null, 7, 11),
  ('Геометрия', null, 7, 11),
  ('Естествознание', null, 1, 6),
  ('Информатика', null, 5, 11),
  ('История Казахстана', null, 5, 11),
  ('Казахский язык', null, 1, 4),
  ('Казахский язык и литература', null, 5, 9),
  ('Литературное чтение', null, 2, 4),
  ('Математика', null, 1, 6),
  ('Музыка', null, 1, 6),
  ('Основы права', null, 9, 11),
  ('Познание мира', null, 1, 4),
  ('Русская литература', null, 5, 11),
  ('Русский язык', null, 2, 11),
  ('Физика', null, 7, 11),
  ('Физическая культура', null, 1, 9),
  ('Химия', null, 7, 11),
  ('Художественный труд', null, 5, 9),
  ('Цифровая грамотность', null, 1, 4)
on conflict (name_ru) do update set
  grade_min = least(public.subjects.grade_min, excluded.grade_min),
  grade_max = greatest(public.subjects.grade_max, excluded.grade_max);

-- 3. Helpful index for the objectives picker (subject+grade lookups).
create index if not exists lo_subject_grade_idx
  on public.learning_objectives(subject_id, grade);
