-- Minute by Minute: color themes you make yourself (Settings → Jobs → Color theme): a name and ten
-- colors each, [{ "id", "name", "colors": [...] }]. Run once; safe to run again.
alter table profiles add column if not exists custom_themes jsonb not null default '[]';
