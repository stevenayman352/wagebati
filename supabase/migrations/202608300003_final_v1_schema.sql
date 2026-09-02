-- ============================================================================
-- Wagbati V1 — Final schema
-- Produces the spec-aligned schema: code-based accounts, draft/published
-- assignments, active/closed conversations, per-attempt submissions with
-- separate video/voice/images, grades, notifications, push tokens, private
-- storage buckets and scheduled jobs. Legacy objects are dropped by
-- 202608290001_initial_wajebaty.
-- ============================================================================

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create type public.app_role as enum ('admin', 'teacher', 'student');
create type public.assignment_status as enum ('draft', 'published');
create type public.conversation_status as enum ('active', 'closed');

-- ---------------------------------------------------------------------------
-- Profiles (V1 accounts)
--   - code is unique across ALL roles and never implies a role
--   - email is the identifier used for Supabase auth sign-in and must be unique
--   - must_change_password forces a password reset on first login
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (email = lower(email) and email like '%@%'),
  code text not null check (char_length(code) between 4 and 24),
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_code_key on public.profiles (code);
create unique index profiles_email_key on public.profiles (email);
create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Classes / enrollment
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  grade_label text not null default '',
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);

create table public.class_students (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Assignments (draft | published) and image-only attachments
-- ---------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 2 and 120),
  instructions text not null default '',
  due_at timestamptz,
  max_grade numeric(6,2) not null default 20 check (max_grade > 0 and max_grade <= 1000),
  status public.assignment_status not null default 'draft',
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignment_attachments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conversations (one per assignment + student, active | closed)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.conversation_status not null default 'active',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Messages (text | voice | image)
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role public.app_role not null,
  kind text not null check (kind in ('text', 'voice', 'image')),
  body text not null default '',
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint check (file_size is null or file_size <= 10485760),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 3600),
  created_at timestamptz not null default now(),
  deleted_from_storage_at timestamptz,
  check (
    (kind = 'text' and body <> '' and storage_path is null) or
    (kind in ('voice', 'image') and storage_path is not null)
  )
);

-- ---------------------------------------------------------------------------
-- Submissions (one row per attempt)
--   - video: mp4/mov, <= 250 MB (deleted from storage 30 days after close)
--   - voice: mp3, <= 10 MB
--   - images: separate rows, jpg/png/webp, <= 10 MB each
--   - unlimited attempts while the conversation is active; none after due_at
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  video_path text,
  video_name text,
  video_mime text check (video_mime in ('video/mp4', 'video/quicktime')),
  video_size bigint check (video_size is null or video_size <= 262144000),
  voice_path text,
  voice_name text,
  voice_mime text check (voice_mime is null or voice_mime = 'audio/mpeg'),
  voice_size bigint check (voice_size is null or voice_size <= 10485760),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, attempt_number),
  check (video_path is not null or voice_path is not null)
);

create table public.submission_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  sort_number integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Grades (numeric + optional comment, recorded by teacher)
-- ---------------------------------------------------------------------------
create table public.grades (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  grade numeric(6,2) not null check (grade >= 0),
  comment text not null default '',
  graded_by uuid not null references public.profiles(id),
  graded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications + push tokens + cleanup log
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'general',
  title text not null,
  body text not null default '',
  href text,
  assignment_id uuid references public.assignments(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  deleted_count integer not null default 0,
  ran_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index class_students_student_id_idx on public.class_students (student_id);
create index class_students_class_id_idx on public.class_students (class_id);
create index class_teachers_teacher_id_idx on public.class_teachers (teacher_id);
create index class_teachers_class_id_idx on public.class_teachers (class_id);
create index assignments_class_id_idx on public.assignments (class_id);
create index assignments_due_at_idx on public.assignments (due_at);
create index assignments_status_idx on public.assignments (status);
create index conversations_assignment_id_idx on public.conversations (assignment_id);
create index conversations_student_id_idx on public.conversations (student_id);
create index conversations_status_idx on public.conversations (status);
create index messages_conversation_id_idx on public.messages (conversation_id);
create index messages_created_at_idx on public.messages (conversation_id, created_at);
create index submissions_conversation_id_idx on public.submissions (conversation_id);
create index submissions_student_id_idx on public.submissions (student_id);
create index submission_images_submission_id_idx on public.submission_images (submission_id);
create index grades_student_id_idx on public.grades (student_id);
create index grades_conversation_id_idx on public.grades (conversation_id);
create index notifications_user_id_idx on public.notifications (user_id, is_read, created_at desc);
create index notifications_conversation_id_idx on public.notifications (conversation_id);

-- ---------------------------------------------------------------------------
-- Utility trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger classes_touch before update on public.classes
for each row execute function public.touch_updated_at();
create trigger assignments_touch before update on public.assignments
for each row execute function public.touch_updated_at();
create trigger conversations_touch before update on public.conversations
for each row execute function public.touch_updated_at();
create trigger submissions_touch before update on public.submissions
for each row execute function public.touch_updated_at();
create trigger grades_touch before update on public.grades
for each row execute function public.touch_updated_at();
create trigger push_tokens_touch before update on public.push_tokens
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.is_teacher_for_class(target_class uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.class_teachers ct
    join public.profiles p on p.id = ct.teacher_id
    where ct.class_id = target_class and ct.teacher_id = auth.uid()
      and p.role = 'teacher' and p.is_active
  );
$$;

create or replace function public.is_student_in_class(target_class uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.class_students cs
    join public.profiles p on p.id = cs.student_id
    where cs.class_id = target_class and cs.student_id = auth.uid()
      and p.role = 'student' and p.is_active
  );
$$;

create or replace function public.can_access_assignment(target_assignment uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.assignments a
    where a.id = target_assignment
      and (
        a.created_by = auth.uid()
        or public.is_teacher_for_class(a.class_id)
        or public.is_student_in_class(a.class_id)
      )
  );
$$;

create or replace function public.can_access_conversation(target_conversation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversations c
    join public.assignments a on a.id = c.assignment_id
    where c.id = target_conversation
      and (
        public.is_admin()
        or c.student_id = auth.uid()
        or public.is_teacher_for_class(a.class_id)
      )
  );
$$;

-- Student media is private to the student and the class teacher; the admin
-- may inspect rows but must NOT be able to open the uploaded files.
create or replace function public.can_access_submission_media(target_conversation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversations c
    join public.assignments a on a.id = c.assignment_id
    where c.id = target_conversation
      and (
        c.student_id = auth.uid()
        or public.is_teacher_for_class(a.class_id)
      )
  );
$$;

create or replace function public.can_draft_edit_assignment(target_assignment uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.assignments a
    where a.id = target_assignment
      and a.status = 'draft'
      and public.is_teacher_for_class(a.class_id)
  );
$$;

create or replace function public.can_submit_to_conversation(target_conversation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversations c
    join public.assignments a on a.id = c.assignment_id
    where c.id = target_conversation
      and c.student_id = auth.uid()
      and c.status = 'active'
      and a.status = 'published'
      and (a.due_at is null or a.due_at > now())
  );
$$;

create or replace function public.can_post_message(target_conversation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (
    public.can_access_conversation(target_conversation)
    and exists (select 1 from public.conversations where id = target_conversation and status = 'active')
  );
$$;

-- Media object routing helper used by storage policies. Object layout:
--   assignment-attachments/{assignment_id}/{file}
--   submissions/{conversation_id}/{attempt}/{file}
--   message-media/{conversation_id}/{file}
create or replace function public.can_read_media_object(object_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when split_part(object_name, '/', 1) = 'assignment-attachments'
      and split_part(object_name, '/', 2) <> ''
      then public.can_access_assignment(split_part(object_name, '/', 2)::uuid)
    when split_part(object_name, '/', 1) = 'submissions'
      and split_part(object_name, '/', 2) <> ''
      then public.can_access_submission_media(split_part(object_name, '/', 2)::uuid)
    when split_part(object_name, '/', 1) = 'message-media'
      and split_part(object_name, '/', 2) <> ''
      then public.can_access_conversation(split_part(object_name, '/', 2)::uuid)
    else false
  end;
$$;

create or replace function public.can_upload_media_object(object_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when split_part(object_name, '/', 1) = 'assignment-attachments'
      and split_part(object_name, '/', 2) <> ''
      then public.can_draft_edit_assignment(split_part(object_name, '/', 2)::uuid)
    when split_part(object_name, '/', 1) = 'submissions'
      and split_part(object_name, '/', 2) <> ''
      then public.can_submit_to_conversation(split_part(object_name, '/', 2)::uuid)
    when split_part(object_name, '/', 1) = 'message-media'
      and split_part(object_name, '/', 2) <> ''
      then public.can_post_message(split_part(object_name, '/', 2)::uuid)
    else false
  end;
$$;

create or replace function public.next_attempt_number(target_conversation uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(max(attempt_number), 0) + 1
  from public.submissions
  where conversation_id = target_conversation;
$$;

-- ---------------------------------------------------------------------------
-- Assignment publish triggers (create conversations + notifications)
-- ---------------------------------------------------------------------------
create or replace function public.create_conversation_for_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' then
    insert into public.conversations (assignment_id, student_id)
    select new.id, cs.student_id
    from public.class_students cs
    where cs.class_id = new.class_id
    on conflict do nothing;

    insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
    select cs.student_id, 'new_assignment', 'واجب جديد', new.title, '/student/assignments/' || c.id, new.id, c.id
    from public.class_students cs
    join public.conversations c on c.assignment_id = new.id and c.student_id = cs.student_id
    where cs.class_id = new.class_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_create_conversations on public.assignments;
create trigger assignment_create_conversations after insert on public.assignments
for each row execute function public.create_conversation_for_student();

create or replace function public.publish_assignment_conversations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status and new.status = 'published' then
    insert into public.conversations (assignment_id, student_id)
    select new.id, cs.student_id
    from public.class_students cs
    where cs.class_id = new.class_id
    on conflict do nothing;

    insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
    select cs.student_id, 'new_assignment', 'واجب جديد', new.title, '/student/assignments/' || c.id, new.id, c.id
    from public.class_students cs
    join public.conversations c on c.assignment_id = new.id and c.student_id = cs.student_id
    where cs.class_id = new.class_id;
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_publish_conversations on public.assignments;
create trigger assignment_publish_conversations after update on public.assignments
for each row execute function public.publish_assignment_conversations();

create or replace function public.create_conversation_for_new_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversations (assignment_id, student_id)
  select a.id, new.student_id
  from public.assignments a
  where a.class_id = new.class_id and a.status = 'published'
  on conflict do nothing;

  insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
  select new.student_id, 'new_assignment', 'واجب جديد', a.title, '/student/assignments/' || c.id, a.id, c.id
  from public.assignments a
  join public.conversations c on c.assignment_id = a.id and c.student_id = new.student_id
  where a.class_id = new.class_id and a.status = 'published'
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists enrollment_create_conversations on public.class_students;
create trigger enrollment_create_conversations after insert on public.class_students
for each row execute function public.create_conversation_for_new_enrollment();

-- ---------------------------------------------------------------------------
-- Published assignments are frozen
-- ---------------------------------------------------------------------------
create or replace function public.guard_published_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'published' and (
    new.title is distinct from old.title
    or new.instructions is distinct from old.instructions
    or new.due_at is distinct from old.due_at
    or new.max_grade is distinct from old.max_grade
    or new.class_id is distinct from old.class_id
    or new.status is distinct from 'published'
  ) then
    raise exception 'الواجب منشور ولا يمكن تعديله';
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_guard_publish on public.assignments;
create trigger assignment_guard_publish before update on public.assignments
for each row execute function public.guard_published_assignment();

create or replace function public.guard_assignment_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.assignments a
    where a.id = new.assignment_id and a.status = 'published'
  ) then
    raise exception 'لا يمكن إرفاق ملفات بعد النشر';
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_attachment_guard on public.assignment_attachments;
create trigger assignment_attachment_guard before insert on public.assignment_attachments
for each row execute function public.guard_assignment_attachment();

-- ---------------------------------------------------------------------------
-- Conversations react to messages
-- ---------------------------------------------------------------------------
create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists message_updates_conversation on public.messages;
create trigger message_updates_conversation after insert on public.messages
for each row execute function public.touch_conversation_after_message();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function public.notify_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_title text;
  student_user uuid;
  body_text text;
begin
  select c.student_id, a.title into student_user, assignment_title
  from public.conversations c
  join public.assignments a on a.id = c.assignment_id
  where c.id = new.conversation_id;

  body_text := case
    when new.kind = 'text' then new.body
    when new.kind = 'voice' then 'تسجيل صوتي جديد'
    when new.kind = 'image' then 'صورة جديدة'
  end;

  if new.sender_id = student_user then
    insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
    select ct.teacher_id, 'message', 'رسالة جديدة من طالب', body_text,
           '/teacher/conversations/' || new.conversation_id, a.id, new.conversation_id
    from public.assignments a
    join public.class_teachers ct on ct.class_id = a.class_id
    where a.id = (select assignment_id from public.conversations where id = new.conversation_id)
    on conflict do nothing;
  else
    insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
    values (student_user, 'message', 'رسالة جديدة من المعلم', body_text,
            '/student/assignments/' || new.conversation_id, new.conversation_id, new.conversation_id);
  end if;

  return new;
end;
$$;

drop trigger if exists message_creates_notification on public.messages;
create trigger message_creates_notification after insert on public.messages
for each row execute function public.notify_after_message();

create or replace function public.notify_after_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
  values (new.student_id, 'grade_recorded', 'تم تسجيل الدرجة', 'درجة جديدة متاحة الآن',
          '/student/assignments/' || new.conversation_id, new.assignment_id, new.conversation_id);
  return new;
end;
$$;

drop trigger if exists grade_creates_notification on public.grades;
create trigger grade_creates_notification after insert or update on public.grades
for each row execute function public.notify_after_grade();

-- ---------------------------------------------------------------------------
-- Due-date reminders (one-day / due-today) — skip closed conversations
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_due_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
  select c.student_id,
         case when a.due_at::date = current_date then 'due_today' else 'due_tomorrow' end,
         case when a.due_at::date = current_date then 'موعد التسليم اليوم' else 'تبقى يوم واحد' end,
         a.title,
         '/student/assignments/' || c.id,
         a.id,
         c.id
  from public.assignments a
  join public.conversations c on c.assignment_id = a.id
  where a.status = 'published'
    and c.status <> 'closed'
    and a.due_at is not null
    and a.due_at::date in (current_date, current_date + 1)
    and not exists (
      select 1 from public.submissions s
      where s.conversation_id = c.id
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = c.student_id
        and n.assignment_id = a.id
        and n.conversation_id = c.id
        and n.type = case when a.due_at::date = current_date then 'due_today' else 'due_tomorrow' end
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Video-only cleanup: delete video FILES from storage 30 days after the
-- conversation is closed, keep submission records and grades intact.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_closed_conversation_files()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  deleted_count integer;
begin
  delete from storage.objects o
  using public.submissions s
  join public.conversations c on c.id = s.conversation_id
  where o.bucket_id = 'submissions'
    and o.name = s.video_path
    and s.video_path is not null
    and c.status = 'closed'
    and c.closed_at < now() - interval '30 days';

  get diagnostics deleted_count = row_count;

  update public.submissions s
  set video_path = null, video_name = null, video_mime = null, video_size = null
  from public.conversations c
  where c.id = s.conversation_id
    and s.video_path is not null
    and c.status = 'closed'
    and c.closed_at < now() - interval '30 days';

  insert into public.cleanup_runs (deleted_count) values (deleted_count);
  return deleted_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_students enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_attachments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_images enable row level security;
alter table public.grades enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.cleanup_runs enable row level security;

-- profiles ----------------------------------------------------------------
create policy "profiles read own or managed" on public.profiles
for select using (
  id = auth.uid() or public.is_admin()
  or exists (select 1 from public.class_teachers ct join public.class_students cs on cs.class_id = ct.class_id where ct.teacher_id = auth.uid() and cs.student_id = profiles.id)
);
create policy "profiles admin write" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- classes ------------------------------------------------------------------
create policy "classes visible to members" on public.classes
for select using (public.is_admin() or public.is_teacher_for_class(id) or public.is_student_in_class(id));
create policy "classes admin manage" on public.classes for all using (public.is_admin()) with check (public.is_admin());

-- class_teachers ------------------------------------------------------------
create policy "class_teachers visible to members" on public.class_teachers
for select using (public.is_admin() or teacher_id = auth.uid() or public.is_student_in_class(class_id));
create policy "class_teachers admin manage" on public.class_teachers for all using (public.is_admin()) with check (public.is_admin());

-- class_students -------------------------------------------------------------
create policy "class_students visible to class members" on public.class_students
for select using (public.is_admin() or student_id = auth.uid() or public.is_teacher_for_class(class_id));
create policy "class_students admin manage" on public.class_students for all using (public.is_admin()) with check (public.is_admin());

-- assignments -----------------------------------------------------------------
create policy "assignments visible to class members" on public.assignments
for select using (public.is_admin() or public.is_teacher_for_class(class_id) or public.is_student_in_class(class_id));
create policy "assignments teacher create" on public.assignments
for insert with check (public.is_admin() or (created_by = auth.uid() and public.is_teacher_for_class(class_id)));
create policy "assignments teacher update" on public.assignments
for update using (public.is_admin() or public.can_draft_edit_assignment(id))
with check (public.is_admin() or public.can_draft_edit_assignment(id));
create policy "assignments teacher delete" on public.assignments
for delete using (public.is_admin() or public.can_draft_edit_assignment(id));

-- assignment_attachments ------------------------------------------------------
create policy "assignment attachments visible to class members" on public.assignment_attachments
for select using (public.can_access_assignment(assignment_id));
create policy "assignment attachments teacher create" on public.assignment_attachments
for insert with check (
  uploaded_by = auth.uid()
  and exists (select 1 from public.assignments a where a.id = assignment_id and public.can_draft_edit_assignment(a.id))
);
create policy "assignment attachments teacher delete" on public.assignment_attachments
for delete using (public.is_admin() or public.can_draft_edit_assignment(assignment_id));

-- conversations ---------------------------------------------------------------
create policy "conversations visible to owner or teacher" on public.conversations
for select using (public.can_access_conversation(id));
create policy "conversations student insert via enrollment" on public.conversations
for insert with check (
  public.is_admin()
  or exists (
    select 1 from public.assignments a
    where a.id = assignment_id
      and public.is_teacher_for_class(a.class_id)
  )
  or (
    student_id = auth.uid()
    and exists (
      select 1
      from public.assignments a
      join public.class_students cs on cs.class_id = a.class_id
      where a.id = assignment_id
        and cs.student_id = auth.uid()
    )
  )
);
create policy "conversations teacher close" on public.conversations
for update using (
  public.is_admin() or exists (select 1 from public.assignments a where a.id = assignment_id and public.is_teacher_for_class(a.class_id))
) with check (
  public.is_admin() or exists (select 1 from public.assignments a where a.id = assignment_id and public.is_teacher_for_class(a.class_id))
);

-- messages ---------------------------------------------------------------------
create policy "messages visible to conversation members" on public.messages
for select using (public.can_access_conversation(conversation_id));
create policy "messages sender create" on public.messages
for insert with check (
  sender_id = auth.uid()
  and public.can_post_message(conversation_id)
);
create policy "messages system update" on public.messages
for update using (public.is_admin()) with check (public.is_admin());

-- submissions ------------------------------------------------------------------
create policy "submissions visible to owner or teacher" on public.submissions
for select using (
  student_id = auth.uid()
  or exists (select 1 from public.assignments a where a.id = assignment_id and public.is_teacher_for_class(a.class_id))
);
create policy "submissions student create" on public.submissions
for insert with check (
  student_id = auth.uid()
  and public.can_submit_to_conversation(conversation_id)
);

-- submission_images --------------------------------------------------------------
create policy "submission images visible to owner or teacher" on public.submission_images
for select using (
  exists (
    select 1 from public.submissions s
    where s.id = submission_id
      and (s.student_id = auth.uid()
           or exists (select 1 from public.assignments a where a.id = s.assignment_id and public.is_teacher_for_class(a.class_id)))
  )
);
create policy "submission images student create" on public.submission_images
for insert with check (
  exists (
    select 1 from public.submissions s
    where s.id = submission_id
      and s.student_id = auth.uid()
      and public.can_submit_to_conversation(s.conversation_id)
  )
);

-- grades -------------------------------------------------------------------------
create policy "grades visible to owner or teacher" on public.grades
for select using (
  student_id = auth.uid()
  or exists (select 1 from public.assignments a where a.id = assignment_id and public.is_teacher_for_class(a.class_id))
);
create policy "grades teacher manage" on public.grades
for all using (
  exists (select 1 from public.assignments a where a.id = assignment_id and public.is_teacher_for_class(a.class_id))
) with check (
  graded_by = auth.uid()
  and exists (select 1 from public.assignments a where a.id = assignment_id and public.is_teacher_for_class(a.class_id))
);

-- notifications -------------------------------------------------------------------
create policy "notifications own read" on public.notifications for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications own update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications system insert" on public.notifications for insert with check (public.is_admin());

-- push_tokens ---------------------------------------------------------------------
create policy "push tokens own read" on public.push_tokens for select using (user_id = auth.uid());
create policy "push tokens own write" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- cleanup_runs --------------------------------------------------------------------
create policy "cleanup admin read" on public.cleanup_runs for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage buckets + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('assignment-attachments', 'assignment-attachments', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('submissions', 'submissions', false, 262144000, array['video/mp4','video/quicktime','image/jpeg','image/png','image/webp','audio/mpeg']),
  ('message-media', 'message-media', false, 10485760, array['image/jpeg','image/png','image/webp','audio/mpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "media readable by authorized members" on storage.objects
for select using (public.can_read_media_object(name));
create policy "media upload by authorized members" on storage.objects
for insert with check (bucket_id in ('assignment-attachments','submissions','message-media') and owner = auth.uid() and public.can_upload_media_object(name));
create policy "media update by owner" on storage.objects
for update using (bucket_id in ('assignment-attachments','submissions','message-media') and owner = auth.uid())
with check (bucket_id in ('assignment-attachments','submissions','message-media') and owner = auth.uid());
create policy "media delete by owner" on storage.objects
for delete using (bucket_id in ('assignment-attachments','submissions','message-media') and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname in (
      'wajebaty-cleanup-closed-conversation-files',
      'wajebaty-due-reminders'
    );
  end if;
end;
$$;

select cron.schedule(
  'wajebaty-cleanup-closed-conversation-files',
  '0 3 * * *',
  $$select public.cleanup_closed_conversation_files();$$
);
select cron.schedule(
  'wajebaty-due-reminders',
  '0 7 * * *',
  $$select public.enqueue_due_reminders();$$
);

-- ---------------------------------------------------------------------------
-- Realtime publications (re-added after table recreation)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;

commit;