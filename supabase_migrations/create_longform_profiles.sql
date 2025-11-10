-- Create the longform_profiles table for profile customizations
CREATE TABLE IF NOT EXISTS longform_profiles (
  npub TEXT PRIMARY KEY,
  background TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_longform_profiles_npub ON longform_profiles(npub);

-- Create a function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_longform_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
DROP TRIGGER IF EXISTS update_longform_profiles_updated_at ON longform_profiles;
CREATE TRIGGER update_longform_profiles_updated_at 
    BEFORE UPDATE ON longform_profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_longform_profiles_updated_at();

-- IMPORTANT: Disable Row Level Security for the longform_profiles table
-- This allows the application to read and insert/update profile records
ALTER TABLE longform_profiles DISABLE ROW LEVEL SECURITY;

