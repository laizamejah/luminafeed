-- Add archived_at column to notifications to support archiving
ALTER TABLE public.notifications
  ADD COLUMN archived_at TIMESTAMPTZ;

-- Allow authenticated users to update their own notification archived flag
-- existing "Mark own notifications" policy covers UPDATE by user on user_id, so no new policy required

CREATE INDEX IF NOT EXISTS notifications_user_archived_idx ON public.notifications (user_id, archived_at);
