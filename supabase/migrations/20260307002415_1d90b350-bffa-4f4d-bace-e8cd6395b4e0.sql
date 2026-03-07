-- Delete duplicate events, keeping the oldest row per (user_id, name, event_start)
DELETE FROM events
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, name, event_start) id
  FROM events
  ORDER BY user_id, name, event_start, created_at ASC
);

-- Add unique index to prevent future duplicates
CREATE UNIQUE INDEX idx_events_user_name_start ON events (user_id, name, event_start);