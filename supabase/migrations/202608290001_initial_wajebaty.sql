-- ============================================================================
-- Wagbati V1 — clean slate
-- The legacy patch migrations are superseded by 202608300003_final_v1_schema.
-- Dropping every legacy object here keeps resets deterministic. All target
-- statements are guarded with IF EXISTS so this is safe on an empty database.
-- ============================================================================

drop policy if exists "private files readable by conversation members" on storage.objects;
drop policy if exists "private files upload by conversation members" on storage.objects;
drop policy if exists "private files update by owner or admin" on storage.objects;
drop policy if exists "private files delete by owner or admin" on storage.objects;
drop function if exists public.can_access_storage_object(text) cascade;

drop table if exists public.submission_images cascade;
drop table if exists public.submissions cascade;
drop table if exists public.grades cascade;
drop table if exists public.assignment_attachments cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.assignments cascade;
drop table if exists public.class_students cascade;
drop table if exists public.class_teachers cascade;
drop table if exists public.classes cascade;
drop table if exists public.notifications cascade;
drop table if exists public.push_tokens cascade;
drop table if exists public.profiles cascade;
drop table if exists public.cleanup_runs cascade;

drop type if exists public.app_role cascade;
drop type if exists public.assignment_status cascade;
drop type if exists public.conversation_status cascade;
drop type if exists public.message_kind cascade;

drop function if exists public.touch_updated_at() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_teacher_for_class(uuid) cascade;
drop function if exists public.is_student_in_class(uuid) cascade;
drop function if exists public.can_access_assignment(uuid) cascade;
drop function if exists public.can_access_conversation(uuid) cascade;
drop function if exists public.can_draft_edit_assignment(uuid) cascade;
drop function if exists public.can_submit_to_conversation(uuid) cascade;
drop function if exists public.can_post_message(uuid) cascade;
drop function if exists public.can_read_media_object(text) cascade;
drop function if exists public.can_upload_media_object(text) cascade;
drop function if exists public.next_attempt_number(uuid) cascade;
drop function if exists public.create_conversation_for_student() cascade;
drop function if exists public.publish_assignment_conversations() cascade;
drop function if exists public.create_conversation_for_new_enrollment() cascade;
drop function if exists public.guard_published_assignment() cascade;
drop function if exists public.guard_assignment_attachment() cascade;
drop function if exists public.touch_conversation_after_message() cascade;
drop function if exists public.notify_after_message() cascade;
drop function if exists public.notify_after_grade() cascade;
drop function if exists public.enqueue_due_reminders() cascade;
drop function if exists public.cleanup_closed_conversation_files() cascade;