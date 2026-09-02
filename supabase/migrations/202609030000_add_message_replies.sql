begin;

-- Allow replying to a previous message in the chat (WhatsApp/Telegram style quote)
alter table public.messages
  add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null;

create index if not exists messages_reply_to_idx on public.messages (reply_to_message_id)
  where reply_to_message_id is not null;

commit;