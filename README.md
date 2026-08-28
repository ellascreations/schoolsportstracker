# School Sports Tracker

Nuxt 4 + Supabase starter app with Admin, Teacher and Student access.

## Included
- Supabase Auth login
- Role-based middleware: Admin / Teacher / Student
- Admin dashboard
- Student and teacher lists
- Houses and sports management
- Event creation
- Teacher event/result entry
- Automatic placing and points
- Student results page
- Live house leaderboard
- Supabase RLS policies

## Setup
1. Create a Supabase project.
2. Open the Supabase SQL Editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env` and add your Supabase URL and anon key.
4. Install and start:

```bash
npm install
npm run dev
```

## Create the first Admin
Create a user in Supabase Authentication, then run this in SQL Editor using that user's email:

```sql
update public.profiles
set role = 'admin', first_name = 'School', last_name = 'Administrator'
where email = 'YOUR-ADMIN-EMAIL@school.edu.au';
```

## Adding students to events
The database already contains `event_participants`. The next UI enhancement is an Admin/Teacher participant picker and CSV student importer.

## Result values
For the starter version, result values are stored as numeric values. For timed events, use seconds (e.g. 12.41). Distance/height can use metres (e.g. 4.82).
