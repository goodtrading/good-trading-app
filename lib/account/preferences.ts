import AsyncStorage from "@react-native-async-storage/async-storage";

export type AccountPreferences = {
  timezone: string;
  language: string;
  notifications: {
    institutionalAlerts: boolean;
    gammaRegimeChanges: boolean;
    keyZoneBreaks: boolean;
    squeezeCascade: boolean;
  };
};

const STORAGE_KEY = "gt_account_preferences_v1";

export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getDeviceLanguage(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "es-AR";
  } catch {
    return "es-AR";
  }
}

export function formatTimezoneLabel(timezone: string): string {
  try {
    const now = new Date();
    const offsetMinutes = -now.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    const offset = `UTC${sign}${hours}${minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : ""}`;
    return `${offset} · ${timezone}`;
  } catch {
    return timezone;
  }
}

export function defaultAccountPreferences(): AccountPreferences {
  return {
    timezone: getDeviceTimezone(),
    language: getDeviceLanguage(),
    notifications: {
      institutionalAlerts: true,
      gammaRegimeChanges: true,
      keyZoneBreaks: true,
      squeezeCascade: false,
    },
  };
}

export async function loadAccountPreferences(): Promise<AccountPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAccountPreferences();
    const parsed = JSON.parse(raw) as Partial<AccountPreferences>;
    const defaults = defaultAccountPreferences();
    return {
      timezone: parsed.timezone ?? defaults.timezone,
      language: parsed.language ?? defaults.language,
      notifications: {
        ...defaults.notifications,
        ...(parsed.notifications ?? {}),
      },
    };
  } catch {
    return defaultAccountPreferences();
  }
}

export async function saveAccountPreferences(preferences: AccountPreferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
