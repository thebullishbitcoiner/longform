# Supabase Integration Setup

This guide explains how to set up Supabase for PRO status checking in Longform.

## Database Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note down your project URL and anon key

### 2. Create the Subscribers Table

Run the following SQL in your Supabase SQL editor:

```sql
-- Create the subscribers table
CREATE TABLE subscribers (
  npub TEXT PRIMARY KEY,
  last_payment TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster lookups
CREATE INDEX idx_subscribers_npub ON subscribers(npub);

-- Create a function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_subscribers_updated_at 
    BEFORE UPDATE ON subscribers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- IMPORTANT: Disable Row Level Security for the subscribers table
-- This allows the application to read and insert subscriber records
ALTER TABLE subscribers DISABLE ROW LEVEL SECURITY;
```

### 3. Alternative: Enable RLS with Proper Policies

If you prefer to keep RLS enabled, use these policies instead:

```sql
-- Enable RLS
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Policy to allow anyone to read subscriber records
CREATE POLICY "Allow public read access" ON subscribers
    FOR SELECT USING (true);

-- Policy to allow authenticated users to insert their own records
-- Note: This requires user authentication in your app
CREATE POLICY "Allow authenticated insert" ON subscribers
    FOR INSERT WITH CHECK (true);

-- Policy to allow updates (for admin purposes)
CREATE POLICY "Allow authenticated update" ON subscribers
    FOR UPDATE USING (true);
```

## Environment Variables

Create a `.env.local` file in your project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Testing the Setup

1. Add a test record to your `subscribers` table:
   ```sql
   INSERT INTO subscribers (npub, last_payment) 
   VALUES ('your_test_npub_here', NOW());
   ```

2. Restart your development server
3. Navigate to `/support` and check if PRO status is detected

## Troubleshooting

### RLS Policy Issues
If you see "new row violates row-level security policy" errors:
1. Go to your Supabase dashboard → Authentication → Policies
2. Check if RLS is enabled on the `subscribers` table
3. Either disable RLS or add the policies shown above

### Connection Issues
- Verify your environment variables are correct
- Check that your Supabase project is active
- Ensure the table name is exactly `subscribers` (lowercase)

### Data Issues
- Verify the `npub` format is correct (should start with `npub1`)
- Check that `last_payment` is a valid timestamp
- Ensure the table has the correct column names and types
