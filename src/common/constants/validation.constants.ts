/** Max length for free-text notes fields across all entities. */
export const NOTES_MAX_LENGTH = 2000;

/**
 * Default max length for generic text columns (host, version strings,
 * board name, species, etc.).
 */
export const STANDARD_TEXT_MAX_LENGTH = 255;

/** Max length for short human-readable name fields (e.g. recipe name, pico-unit name). */
export const NAME_MAX_LENGTH = 128;

/** Min length for required name / identifier fields. */
export const NAME_MIN_LENGTH = 1;

/** Max length for the Pico unit `handle` field (mirrors the firmware device_name cap). */
export const HANDLE_MAX_LENGTH = 64;

/** Max length for the Pico unit `description` (longer free-text than a name). */
export const PICO_DESCRIPTION_MAX_LENGTH = 512;

/** Max length for short description fields (e.g., batch description). */
export const DESCRIPTION_MAX_LENGTH = 120;
