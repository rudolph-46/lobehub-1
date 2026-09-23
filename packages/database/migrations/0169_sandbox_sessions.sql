CREATE TABLE IF NOT EXISTS "sandbox_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"region" varchar(255),
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sandbox_sessions_topic_not_empty" CHECK (length(btrim("sandbox_sessions"."topic_id")) > 0),
	CONSTRAINT "sandbox_sessions_sandbox_not_empty" CHECK (length(btrim("sandbox_sessions"."sandbox_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "sandbox_sessions" DROP CONSTRAINT IF EXISTS "sandbox_sessions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ADD CONSTRAINT "sandbox_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sandbox_sessions_user_topic_idx" ON "sandbox_sessions" USING btree ("user_id","topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandbox_sessions_sandbox_id_idx" ON "sandbox_sessions" USING btree ("sandbox_id");
