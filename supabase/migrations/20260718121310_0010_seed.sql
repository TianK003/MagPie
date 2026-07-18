-- Magpie initial migration 0010: seed data (idempotent)
-- 3 real-company campaigns: company names only as keywords, 5c flat, cap 20/day, cooldown 60s,
-- no weekend multiplier (1.0), min level 1, imaginary EUR5,000 (500000c) budget each.
-- Badges: first_fiver + chatterbox active; brand_loyalist ships inactive (locked in v1).

insert into public.campaigns
  (slug, name, category, rate_cents, cap_per_day, weekend_multiplier, min_level, cooldown_seconds, keywords, budget_cents)
values
  ('elevenlabs', 'ElevenLabs', 'AI voice',    5, 20, 1.0, 1, 60, array['elevenlabs','eleven labs'], 500000),
  ('openai',     'OpenAI',     'AI research', 5, 20, 1.0, 1, 60, array['openai','open ai'],          500000),
  ('anthropic',  'Anthropic',  'AI research', 5, 20, 1.0, 1, 60, array['anthropic'],                  500000)
on conflict (slug) do nothing;

insert into public.badges (code, name, description, active, sort)
values
  ('first_fiver',    'First Fiver',    'earned your first $5',                 true,  1),
  ('chatterbox',     'Chatterbox',     '5 paid mentions in a single session',  true,  2),
  ('brand_loyalist', 'Brand Loyalist', 'coming soon',                          false, 3)
on conflict (code) do nothing;
