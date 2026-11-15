CREATE INDEX IF NOT EXISTS "denyut_pada_idx" ON "denyut" USING btree ("pada");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rec_answer_question_idx" ON "rec_answer" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetri_log_dicatat_idx" ON "telemetri_log" USING btree ("dicatat_pada");