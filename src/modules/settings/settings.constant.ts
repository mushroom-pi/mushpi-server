export const SETTINGS_SINGLE_ROW_ID = 1 as const;

/** OS timezone, resolved once at import time. Falls back to 'UTC' if unresolvable. */
export const OS_TIMEZONE: string = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();
