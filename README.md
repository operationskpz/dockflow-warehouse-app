# DockFlow Warehouse Tasks

Warehouse task management with shared Supabase data and private photo/PDF attachments.

## Deployment

Static app intended for the existing `operationskpz/dockflow-warehouse-app` GitHub Pages repository. Publish branch `main`, root directory. `.nojekyll` keeps the files unchanged. No build command or paid hosting is required. Supabase free-tier limits apply.

The browser uses a publishable API key, never an administrative key. The pinned Supabase JavaScript library is vendored locally at version 2.119.0 (MIT license, see vendor/LICENSE.supabase).

## Employee access

Only authenticated users explicitly listed in `public.dockflow_members` may read or modify this warehouse's tasks, assignment labels, and attachments. The app has no public registration or demo mode. Tasks are never persisted in browser localStorage; Supabase stores the login session locally. Signing out clears in-memory warehouse data.

This app is one shared warehouse: every approved member may create, edit, and delete all tasks and attachments. Team entries are assignment labels, not login accounts. `role` in the membership table is descriptive; it does not implement separate manager/employee task permissions.

Administrators create employee accounts through Supabase Authentication and then add the account's UUID to `dockflow_members`. Employees can use “Forgot password?” on the sign-in page. Configure Supabase Auth Site URL as `https://operationskpz.github.io/dockflow-warehouse-app/` and allow the exact redirect `https://operationskpz.github.io/dockflow-warehouse-app/?reset=1`. Recovery links show a form for choosing a password, then sign out sessions and return to sign-in. Password recovery never approves warehouse membership. Email delivery depends on the project’s email provider configuration. Do not give employees access to your GitHub or Supabase administrator account.

**Outstanding setup:** Public signup is still enabled in the Supabase project. Disable “Allow new users to sign up” in Supabase Authentication settings. The membership gate still denies unapproved users warehouse data. There were zero login accounts and zero approved members at verification time.

## Attachments and refresh

Photos and PDFs, up to 5 MB, are stored in the private `dockflow-attachments` bucket. Links are created when an employee opens an attachment and expire after 60 seconds. Anyone who obtains a signed link can use it until it expires. Attachments themselves are not cached by the service worker. Replacing or deleting a task attachment attempts to delete the old file; a network failure may leave an orphan file for administrator cleanup.

Use Settings → Refresh shared data to see other employees' changes. Returning to the app also refreshes it. No realtime subscriptions are configured. Service worker offline caching includes application files only; employee login and warehouse operations require a network connection.

## Database

The Supabase project already contains the DockFlow tables and private storage policies. `database/setup.sql` documents an idempotent installation for a separate project. Do not run the original ZIP's setup.sql: it uses different tables and broader authenticated-user access. The existing `amazon_inventory` table is outside DockFlow's scope and was not modified.

The least-privilege grant change was applied to the live project. Anonymous users have no table privileges; authenticated users can SELECT their own membership and perform task/assignment CRUD subject to membership policies. Authenticated users cannot TRUNCATE any DockFlow table or change membership.

## Verification

Run `node --test tests/access.test.cjs` and `node --check app.js`.

Passed: twelve automated application checks covering sign-in gating, approved/unapproved accounts using mocked API responses, sign-out clearing, failed refresh clearing, protection against an old request restoring data after sign-out, absence of signup/local task persistence/administrative keys, and password recovery requests, expired links, password confirmation, and post-reset sign-out. Live database checks confirmed that an unapproved identity cannot read, create, update, or delete a task, or add its own membership. The transaction was rolled back.

**Not completed:** browser UI checks, actual employee email/password sign-ins, and task/attachment sharing between two real accounts. Automatic approval review rejected a proposed temporary privileged test endpoint; it was not deployed. No test users were created.

## Assigning multiple workers

Create or edit a task and check each worker under Assign workers. Both names appear on the task; search and CSV export include all assigned workers, and each worker’s workload counts the shared task. Add worker names in Team first. Existing single-worker assignments are preserved. For a new database, run database/setup.sql followed by database/multiple-assignees.sql.

## Language

Use the Language / Idioma selector at the top of the app, including before sign-in, to choose English or Español. The choice is saved in this browser. Task titles, notes, worker names, and database status values are preserved. Interface labels, status display, and dates follow the chosen language.

## Start and finish task timing

Task cards have Start task and Finish task buttons. The database records timestamps in UTC; cards display them in the viewer’s local timezone. Elapsed time updates each second while the page is visible and continues across app closure. It measures elapsed time minus explicit pauses; breaks count unless Pause task is clicked. It is not per-worker payroll time. A worker may start a task and another approved worker may finish it. Retried actions preserve the original timestamps. Historical tasks are not backdated. Changing an already completed task back to In Progress begins a new timing cycle, replacing the previous cycle; reopening it as To Do or Blocked clears its timing. CSV includes started_at, finished_at, and duration_seconds. Apply database/task-timing.sql after the other database scripts when installing a new project.

## Pause and resume

Started tasks have Pause task and Finish task controls. Paused tasks show Paused since and Resume task. The timer freezes while paused, including when the app is closed. Pause state and accumulated pause seconds are shared in Supabase. Finishing a paused task excludes its last pause. CSV duration_seconds also excludes pauses. After task-timing.sql, apply database/task-pause.sql for a new installation.

## Today dashboard by worker

Dashboard uses the task due date and the viewer’s local calendar date to show today’s tasks only. Each Team worker has a separate box; shared tasks appear under each assigned worker but totals count each task once. Unassigned tasks have their own box. Future tasks, past-due tasks, and tasks without due dates remain accessible through All tasks. New tasks created from Dashboard default their due date to today. The board rolls to the next day when visible; an open edit form is preserved until it is closed.

## All Tasks date sections

All Tasks groups matching tasks by due date into Today, Tomorrow, and Later. Earlier dates and tasks without a due date appear in their own sections when present. Searches and status/operation filters apply before grouping. Today and tomorrow use the device’s local calendar date, including across month/year boundaries. Operation view keeps its existing list.

## Repeated Tasks

Managers can create, edit, pause/resume, and delete recurring schedules in Repeated Tasks. Approved employees can read schedules and work on generated tasks. Choose daily, weekdays, weekly, or monthly; an anchor/first date; an optional end date; workers; operation; priority; notes; and schedule timezone. Default timezone is America/New_York (Eastern). Weekly uses the first date’s weekday. Monthly uses the anchor day, clamped to the last day in shorter months, without drifting the following month.

The database cron job dockflow-repeated-tasks runs every five minutes, independent of the browser. A separate task is created on its scheduled date, with that exact due date, the selected workers, To Do status, no attachment, and no running timer. Future task instances are not created ahead of their due dates; the next date is shown on the schedule. Saving/resuming a schedule also requests generation immediately when an instance is due.

Rule rows are locked during generation. Deterministic instance IDs and a unique rule/date index prevent duplicates. The cursor advances after each instance; deleting a generated task does not regenerate it. Existing instances are not edited when their schedule changes, pauses, or is deleted. Resuming a paused schedule starts from the current date and does not backfill dates intentionally skipped while paused. Changes to start/frequency/timezone/end date also recalculate from today. A scheduler outage is caught up from its saved cursor, at most 366 dates per rule per pass. Supabase free projects may pause while inactive; no jobs run while the project is paused, and missed dates are processed after the project resumes.

Apply database/repeated-tasks.sql after the existing setup scripts for a new installation. It enables pg_cron. Generator functions are SECURITY INVOKER and do not bypass RLS; manager authorization is checked for authenticated RPC callers. The cron job runs as postgres.

Verification: 29 automated app checks pass, including schedule payloads, multi-worker assignments, date validation, manager-only controls, Spanish labels, and clearing state at sign-out. Live read-only SQL checks passed for short months, monthly anchor preservation, weekend skipping, and weekly year boundaries. The cron job has successful recorded runs. Test schedule/instance creation was not verified: the client cancelled the database tool’s confirmation before the rollback-only test could run. No test schedules or instances were written.

## Compact worker overview

Dashboard worker boxes use a compact grid (about five columns on a typical desktop, two on phones). Each box has a bounded, keyboard-focusable scrolling task list, so workers with many tasks do not push all other boxes down. Compact rows keep task titles, status, working time and action buttons visible; expand Details for notes, start/finish timestamps, workers and attachments. All Tasks retains its existing full cards.
