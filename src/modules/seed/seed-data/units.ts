import { UnitSeedEntry } from '../seed.types';

/**
 * Demo unit roster — six simulated grow tents. Every unit is labelled as
 * simulated in `description`; `tent-six` is the deliberate offline unit
 * (failed_calls at the offline threshold, last_seen in the past, never
 * seeded with readings), and `tent-three` is the drifting unit whose
 * readings history wanders before returning to its active-batch setpoints.
 * No `mock-tent-*` handles — these are server-seeded, not mock-announced.
 */
const DESCRIPTION = 'Simulated demo unit — not real hardware.';
const MICROPYTHON = 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)';
const BOARD = 'Raspberry Pi Pico 2 W with RP2350';
const TOTAL_MEM = 2621440;
const TOTAL_FS = 457152;

export const SEED_UNITS: UnitSeedEntry[] = [
  {
    handle: 'tent-one',
    name: 'Tent One',
    description: DESCRIPTION,
    face_color: '#7cb342',
    mac: '28:cd:c1:0a:01:01',
    micropython_version: MICROPYTHON,
    // Strict SemVer (no suffixes) — matches the announce DTO bound.
    firmware_version: '1.4.2',
    api_version: 1,
    board: BOARD,
    board_total_mem_byte: TOTAL_MEM,
    board_total_fs_byte: TOTAL_FS,
    board_cpu_freq_mhz: 150,
  },
  {
    handle: 'tent-two',
    name: 'Tent Two',
    description: DESCRIPTION,
    face_color: '#26a69a',
    mac: '28:cd:c1:0a:02:01',
    micropython_version: MICROPYTHON,
    firmware_version: '1.4.2',
    api_version: 1,
    board: BOARD,
    board_total_mem_byte: TOTAL_MEM,
    board_total_fs_byte: TOTAL_FS,
    board_cpu_freq_mhz: 150,
  },
  {
    handle: 'tent-three',
    name: 'Tent Three',
    description: `${DESCRIPTION} Sensor drift on this unit is part of the demo.`,
    face_color: '#ab47bc',
    mac: '28:cd:c1:0a:03:01',
    micropython_version: MICROPYTHON,
    firmware_version: '1.4.1',
    api_version: 1,
    board: BOARD,
    board_total_mem_byte: TOTAL_MEM,
    board_total_fs_byte: TOTAL_FS,
    board_cpu_freq_mhz: 150,
    // Wandering walk profile for the readings history.
    drift: true,
  },
  {
    handle: 'tent-four',
    name: 'Tent Four',
    description: DESCRIPTION,
    face_color: '#42a5f5',
    mac: '28:cd:c1:0a:04:01',
    micropython_version: MICROPYTHON,
    firmware_version: '1.4.2',
    api_version: 1,
    board: BOARD,
    board_total_mem_byte: TOTAL_MEM,
    board_total_fs_byte: TOTAL_FS,
    board_cpu_freq_mhz: 150,
  },
  {
    handle: 'tent-five',
    name: 'Tent Five',
    description: DESCRIPTION,
    face_color: '#ef5350',
    mac: '28:cd:c1:0a:05:01',
    micropython_version: MICROPYTHON,
    firmware_version: '1.3.0',
    api_version: 1,
    board: BOARD,
    board_total_mem_byte: TOTAL_MEM,
    board_total_fs_byte: TOTAL_FS,
    board_cpu_freq_mhz: 150,
    // No in-progress batch — the readings walk targets these ambient
    // setpoints so the series still terminates in the hysteresis band.
    fallbackSetpoint: { temperature: 28, humidity: 90 },
  },
  {
    handle: 'tent-six',
    name: 'Tent Six',
    description: `${DESCRIPTION} Offline — no hardware behind it.`,
    face_color: '#78909c',
    mac: '28:cd:c1:0a:06:01',
    micropython_version: MICROPYTHON,
    firmware_version: '1.2.4',
    api_version: 1,
    board: BOARD,
    board_total_mem_byte: TOTAL_MEM,
    board_total_fs_byte: TOTAL_FS,
    board_cpu_freq_mhz: 150,
    // Renders `offline` via the existing status derivation (failed_calls at
    // the threshold, last_seen aged by the seeder); never gets readings and
    // never gets a batch.
    offline: true,
  },
];
