CREATE TABLE "company_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"uploaded_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"owner_role" text NOT NULL,
	"confidentiality" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"allowed_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_documents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "company_org_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_title" text NOT NULL,
	"person_name" text,
	"reports_to" text,
	"division" text NOT NULL,
	"responsibility" text NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"kpi" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"target_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "training_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document_slug" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_document_versions" ADD CONSTRAINT "company_document_versions_document_id_company_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."company_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_document_versions" ADD CONSTRAINT "company_document_versions_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_document_versions_document_idx" ON "company_document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_document_versions_document_version_idx" ON "company_document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "company_document_versions_created_idx" ON "company_document_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "company_documents_category_idx" ON "company_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "company_documents_owner_idx" ON "company_documents" USING btree ("owner_role");--> statement-breakpoint
CREATE INDEX "company_documents_status_idx" ON "company_documents" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "company_org_roles_title_idx" ON "company_org_roles" USING btree ("role_title");--> statement-breakpoint
CREATE INDEX "company_org_roles_division_idx" ON "company_org_roles" USING btree ("division");--> statement-breakpoint
CREATE INDEX "company_org_roles_order_idx" ON "company_org_roles" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "training_courses_category_idx" ON "training_courses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "training_courses_order_idx" ON "training_courses" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "training_courses_status_idx" ON "training_courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "training_lessons_course_idx" ON "training_lessons" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "training_lessons_order_idx" ON "training_lessons" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "training_progress_user_course_idx" ON "training_progress" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "training_progress_user_idx" ON "training_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "training_progress_course_idx" ON "training_progress" USING btree ("course_id");