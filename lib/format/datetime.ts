const TIME_ZONE = "Asia/Jakarta";
const EMPTY = "—";
const DEFAULT_LOCALE = "en-GB";

type Variant = "datetime" | "date" | "time";

const OPTIONS: Record<Variant, Intl.DateTimeFormatOptions> = {
  datetime: {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  date: { day: "numeric", month: "short", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit" },
};

const cache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(variant: Variant, locale: string): Intl.DateTimeFormat {
  const key = `${variant}:${locale}`;
  let fmt = cache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, {
      ...OPTIONS[variant],
      timeZone: TIME_ZONE,
      hourCycle: "h23",
    });
    cache.set(key, fmt);
  }
  return fmt;
}

function format(
  variant: Variant,
  value: string | Date | null | undefined,
  locale: string,
): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return getFormatter(variant, locale).format(date);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  return format("datetime", value, locale);
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  return format("date", value, locale);
}

export function formatTime(
  value: string | Date | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  return format("time", value, locale);
}
