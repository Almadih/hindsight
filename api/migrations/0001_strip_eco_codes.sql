-- Drop the ECO code ("C41 Philidor Defense" -> "Philidor Defense") from openings stored before the book lost them.
-- Apply: npx wrangler d1 execute DB --remote --file migrations/0001_strip_eco_codes.sql
UPDATE analyzed_games
SET report_json = json_set(report_json, '$.opening', substr(json_extract(report_json, '$.opening'), 5))
WHERE json_extract(report_json, '$.opening') GLOB '[A-E][0-9][0-9] *';
