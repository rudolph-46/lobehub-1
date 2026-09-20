CREATE TABLE IF NOT EXISTS "crm_field_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" varchar(255) NOT NULL,
	"label" varchar(255) NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_field_defs_key_not_empty" CHECK (length(btrim("crm_field_defs"."key")) > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text DEFAULT 'note' NOT NULL,
	"content" text NOT NULL,
	"author_type" text DEFAULT 'user' NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"created_by_agent_id" text,
	"name" varchar(255) NOT NULL,
	"category" varchar(255),
	"city" varchar(255),
	"district" varchar(255),
	"size" integer,
	"phone" varchar(255),
	"whatsapp" varchar(255),
	"email" varchar(255),
	"website" text,
	"score" integer,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_leads_name_not_empty" CHECK (length(btrim("crm_leads"."name")) > 0),
	CONSTRAINT "crm_leads_score_range" CHECK ("crm_leads"."score" IS NULL OR ("crm_leads"."score" >= 1 AND "crm_leads"."score" <= 5)),
	CONSTRAINT "crm_leads_custom_fields_object" CHECK (jsonb_typeof("crm_leads"."custom_fields") = 'object')
);
--> statement-breakpoint
ALTER TABLE "crm_field_defs" ADD CONSTRAINT "crm_field_defs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_field_defs_key_idx" ON "crm_field_defs" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_interactions_lead_id_idx" ON "crm_interactions" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_leads_dedupe_key_idx" ON "crm_leads" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_leads_status_score_idx" ON "crm_leads" USING btree ("status","score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_leads_city_idx" ON "crm_leads" USING btree ("city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_leads_visibility_user_idx" ON "crm_leads" USING btree ("visibility","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_leads_custom_fields_idx" ON "crm_leads" USING gin ("custom_fields");
