-- Undoes migration 0004 (save receipts and the app version gate). Saved streaks are not touched.
drop trigger if exists user_docs_gate on public.user_docs;
drop trigger if exists user_docs_receipt on public.user_docs;
drop function if exists public.user_docs_gate();
drop function if exists public.user_docs_receipt();
drop table if exists public.save_receipts;
delete from private.config where k = 'min_app' or k like 'min_app:%';
