begin;

create or replace function public.notify_after_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  assignment_title text;
  student_user uuid;
  assignment_id uuid;
  body_text text;
begin
  select c.student_id, a.title, a.id into student_user, assignment_title, assignment_id
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
           '/teacher/conversations/' || new.conversation_id, assignment_id, new.conversation_id
    from public.assignments a
    join public.class_teachers ct on ct.class_id = a.class_id
    where a.id = assignment_id
    on conflict do nothing;
  else
    insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
    values (student_user, 'message', 'رسالة جديدة من المعلم', body_text,
            '/student/assignments/' || new.conversation_id, assignment_id, new.conversation_id);
  end if;

  return new;
end;
$function$;

commit;