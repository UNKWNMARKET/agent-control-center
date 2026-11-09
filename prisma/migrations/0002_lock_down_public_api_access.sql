-- This application talks to Postgres through Prisma with a privileged role.
-- It never uses Supabase's REST API, so the public "anon" and "authenticated"
-- roles have no business reading anything. Left as Supabase creates them,
-- the anon key -- which is designed to be published in client code -- could
-- read every agency's leads, customers and password hashes.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- And stop any table added later from being granted automatically.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Belt and braces: with row level security on and no policy for them, those
-- roles see nothing even if a grant is restored by accident. The table owner
-- that Prisma connects as is unaffected.
alter table "Agency" enable row level security;
alter table "User" enable row level security;
alter table "Invite" enable row level security;
alter table "PasswordResetToken" enable row level security;
alter table "Vendor" enable row level security;
alter table "Setting" enable row level security;
alter table "Lead" enable row level security;
alter table "Policy" enable row level security;
alter table "PolicyDocument" enable row level security;
alter table "Activity" enable row level security;
alter table "DncEntry" enable row level security;
