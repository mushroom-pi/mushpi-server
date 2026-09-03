/**
 * Baseline migration — snapshot of the full schema as it exists today.
 *
 * Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout so
 * it is safe to run against databases that were created historically via
 * `synchronize: true` (dev/local) — all statements become no-ops when the
 * objects already exist.
 *
 * down() is intentionally a no-op: reversing a baseline = dropping all tables
 * = data loss. Not supported.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1788454880680 implements MigrationInterface {
  name = 'InitSchema1788454880680';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // pico_unit — no FKs, referenced by batch and readings
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "pico_unit" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "handle" text NOT NULL,
        "name" text,
        "description" text,
        "face_color" text,
        "ip" text,
        "mac" text,
        "port" integer NOT NULL DEFAULT (5000),
        "enabled" boolean NOT NULL DEFAULT (1),
        "last_seen" datetime,
        "micropython_version" text,
        "software_version" text,
        "board" text,
        "board_total_mem_byte" integer DEFAULT (0),
        "board_total_fs_byte" integer DEFAULT (0),
        "board_cpu_freq_mhz" integer DEFAULT (0),
        "failed_calls" integer NOT NULL DEFAULT (0),
        "failed_readings" integer NOT NULL DEFAULT (0),
        "consecutive_empty_readings" integer NOT NULL DEFAULT (0),
        CONSTRAINT "UQ_fe71723067ef220b65e6118aa3e" UNIQUE ("handle")
      )`,
    );

    // recipe — no FKs, referenced by batch
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "recipe" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL,
        "species" text NOT NULL,
        "temperature_target" integer NOT NULL,
        "humidity_target" integer NOT NULL,
        "duration_days" integer NOT NULL,
        "notes" text,
        "image" text,
        "created_at" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_5b490d0ac36eb4d537228888bfe" UNIQUE ("name")
      )`,
    );

    // batch — FKs to pico_unit (CASCADE) and recipe (SET NULL)
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "batch" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "start_at" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "finish_at" datetime,
        "species" text,
        "temperature_target" integer,
        "humidity_target" integer,
        "notes" text NOT NULL DEFAULT (''),
        "description" text,
        "images" text,
        "pico_unit_id" integer NOT NULL,
        "recipe_id" integer,
        CONSTRAINT "FK_3bef1705b14edfc0def6fa2804e" FOREIGN KEY ("pico_unit_id") REFERENCES "pico_unit" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_4c0f0aa5118d19d3718c499d691" FOREIGN KEY ("recipe_id") REFERENCES "recipe" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_3bef1705b14edfc0def6fa2804" ON "batch" ("pico_unit_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_4c0f0aa5118d19d3718c499d69" ON "batch" ("recipe_id")`,
    );

    // readings — FK to pico_unit (CASCADE)
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "readings" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "ts" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "temperature" float,
        "humidity" integer,
        "last_sensor_err" text,
        "fan_on" boolean NOT NULL DEFAULT (0),
        "humidifier_on" boolean NOT NULL DEFAULT (0),
        "heater_on" boolean NOT NULL DEFAULT (0),
        "control_loop_enabled" boolean NOT NULL DEFAULT (0),
        "temperature_set" integer,
        "humidity_set" integer,
        "board_uptime_s" integer NOT NULL DEFAULT (0),
        "board_temp" float NOT NULL DEFAULT (0),
        "board_used_mem" integer NOT NULL DEFAULT (0),
        "board_used_fs" integer NOT NULL DEFAULT (0),
        "time_to_response_ms" integer NOT NULL DEFAULT (0),
        "pico_unit_id" integer NOT NULL,
        CONSTRAINT "FK_e4bf12f010d66e8a486076035f8" FOREIGN KEY ("pico_unit_id") REFERENCES "pico_unit" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_e4bf12f010d66e8a486076035f" ON "readings" ("pico_unit_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_readings_unit_ts" ON "readings" ("pico_unit_id", "ts")`,
    );

    // settings — single-row config table
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "settings" (
        "id" integer PRIMARY KEY NOT NULL,
        "timezone" text NOT NULL
      )`,
    );

    // health — sqlite-health module liveness checks
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "health" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Baseline reversal = dropping all tables = data loss. Not supported.
  }
}
