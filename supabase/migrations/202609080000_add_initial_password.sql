-- Add initial_password column to profiles table
-- Stores the initial password set by admin for accounts that must change password on first login
-- Cleared when user successfully changes their password

alter table public.profiles 
add column if not exists initial_password text;