CREATE TABLE "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"criteria" json NOT NULL,
	"badge_color" text DEFAULT 'driiva-blue',
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "community_pool" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_amount" numeric(15, 2) NOT NULL,
	"safety_factor" numeric(5, 2) DEFAULT '0.80',
	"participant_count" integer DEFAULT 0,
	"safe_driver_count" integer DEFAULT 0,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driving_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"current_score" integer DEFAULT 0,
	"hard_braking_score" integer DEFAULT 0,
	"acceleration_score" integer DEFAULT 0,
	"speed_adherence_score" integer DEFAULT 0,
	"night_driving_score" integer DEFAULT 0,
	"cornering_score" integer DEFAULT 0,
	"consistency_score" integer DEFAULT 0,
	"total_trips" integer DEFAULT 0,
	"total_miles" numeric(10, 2) DEFAULT '0.00',
	"projected_refund" numeric(10, 2) DEFAULT '0.00',
	"last_updated" timestamp DEFAULT now(),
	CONSTRAINT "driving_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"incident_type" text NOT NULL,
	"description" text,
	"location" text,
	"severity" text DEFAULT 'medium',
	"status" text DEFAULT 'reported',
	"reported_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "leaderboard" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"score" integer NOT NULL,
	"rank" integer NOT NULL,
	"period" text DEFAULT 'weekly',
	"last_updated" timestamp DEFAULT now(),
	CONSTRAINT "leaderboard_user_id_period_unique" UNIQUE("user_id","period")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"policy_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"coverage_type" text DEFAULT 'standard' NOT NULL,
	"base_premium_cents" integer DEFAULT 0 NOT NULL,
	"current_premium_cents" integer DEFAULT 0 NOT NULL,
	"discount_percentage" integer DEFAULT 0,
	"effective_date" timestamp NOT NULL,
	"expiration_date" timestamp NOT NULL,
	"renewal_date" timestamp,
	"stripe_subscription_id" text,
	"billing_cycle" text DEFAULT 'annual',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"start_location" text,
	"end_location" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"distance" numeric(10, 2) NOT NULL,
	"duration" integer NOT NULL,
	"score" integer NOT NULL,
	"hard_braking_events" integer DEFAULT 0,
	"harsh_acceleration" integer DEFAULT 0,
	"speed_violations" integer DEFAULT 0,
	"night_driving" boolean DEFAULT false,
	"sharp_corners" integer DEFAULT 0,
	"telematics_data" json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trips_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"firestore_trip_id" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"distance_km" numeric(10, 2) NOT NULL,
	"duration_seconds" integer NOT NULL,
	"score" integer NOT NULL,
	"hard_braking_events" integer DEFAULT 0,
	"harsh_acceleration" integer DEFAULT 0,
	"speed_violations" integer DEFAULT 0,
	"night_driving" boolean DEFAULT false,
	"sharp_corners" integer DEFAULT 0,
	"start_address" text,
	"end_address" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" text,
	CONSTRAINT "trips_summary_firestore_trip_id_unique" UNIQUE("firestore_trip_id")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"achievement_id" integer NOT NULL,
	"unlocked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"firebase_uid" text,
	"username" text,
	"email" text NOT NULL,
	"password" text,
	"display_name" text,
	"first_name" text,
	"last_name" text,
	"phone_number" text,
	"date_of_birth" timestamp,
	"license_number" text,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"premium_amount" numeric(10, 2) DEFAULT '500.00',
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"key" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0,
	"device_type" text,
	"device_name" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"last_used" timestamp,
	CONSTRAINT "webauthn_credentials_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
ALTER TABLE "driving_profiles" ADD CONSTRAINT "driving_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips_summary" ADD CONSTRAINT "trips_summary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;