-- Add index on user_votes(city_id) for reporting/admin queries
CREATE INDEX IF NOT EXISTS idx_user_votes_city_id ON user_votes(city_id);

