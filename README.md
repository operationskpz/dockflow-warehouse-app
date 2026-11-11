# DockFlow Warehouse Tasks

Warehouse task management with shared Supabase data and private photo/PDF attachments.

## Deployment

Static app intended for the existing `operationskpz/dockflow-warehouse-app` GitHub Pages repository. Publish branch `main`, root directory. `.nojekyll` keeps the files unchanged. No build command or paid hosting is required. Supabase free-tier limits apply.

The browser uses a publishable API key, never an administrative key. The pinned Supabase JavaScript library is vendored locally at version 2.119.0 (MIT license, see vendor/LICENSE.supabase).

## Employee access

Only authenticated users explicitly listed in `public.dockflow_members` may read or modify this warehouse's tasks, assignment labels, and attachments. The app has no public registration or demo mode. Tasks are never persisted in browser localStorage; Supabase stores the login session locally. Signing out clears in-memory warehouse data.

This app is one shared warehouse: every approved member may create, edit, and delete all tasks and attachments. Team entries are assignment labels, not login accounts. `role` in the membership table is descriptive; it does not implement separate manager/employee task permissions.

Administrators create employee accounts through Supabase Authentication and then add the account's UUID to `dockflow_members`. Password resets are managed by the administrator. Do not give employees access to your GitHub or Supabase administrator account.

**Outstanding setup:** Public signup is still enabled in the Supabase project. Disable “Allow new users to sign up” in Supabase Authentication settings. The membership gate still denies unapproved users warehouse data. There were zero login accounts and zero approved members at verification time.

## Attachments and refresh

Photos and PDFs, up to 5 MB, are stored in the private `dockflow-attachments` bucket. Links are created when an employee opens an attachment and expire after 60 seconds. Anyone who obtains a signed link can use it until it expires. Attachments themselves are not cached by the service worker. Replacing or deleting a task attachment attempts to delete the old file; a network failure may leave an orphan file for administrator cleanup.

Use Settings → Refresh shared data to see other employees' changes. Returning to the app also refreshes it. No realtime subscriptions are configured. Service worker offline caching includes application files only; employee login and warehouse operations require a network connection.

## Database

The Supabase project already contains the DockFlow tables and private storage policies. `database/setup.sql` documents an idempotent installation for a separate project. Do not run the original ZIP's setup.sql: it uses different tables and broader authenticated-user access. The existing `amazon_inventory` table is outside DockFlow's scope and was not modified.

The least-privilege grant change was applied to the live project. Anonymous users have no table privileges; authenticated users can SELECT their own membership and perform task/assignment CRUD subject to membership policies. Authenticated users cannot TRUNCATE any DockFlow table or change membership.

## Verification

Run `node --test tests/access.test.cjs` and `node --check app.js`.

Passed: seven automated application checks covering sign-in gating, approved/unapproved accounts using mocked API responses, sign-out clearing, failed refresh clearing, protection against an old request restoring data after sign-out, and absence of signup/local task persistence/administrative keys. Live database checks confirmed that an unapproved identity cannot read, create, update, or delete a task, or add its own membership. The transaction was rolled back.

**Not completed:** browser UI checks, actual employee email/password sign-ins, and task/attachment sharing between two real accounts. Automatic approval review rejected a proposed temporary privileged test endpoint; it was not deployed. No test users were created.
