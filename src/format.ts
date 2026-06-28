// Number formatting matching the prototype (Intl en-US grouping + fixed decimals).

export function fmt(n: number, d: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
}

/** Compact count, e.g. 1400 -> "1.4k". */
export function fmtK(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n) + '';
}

/** "HH:MM:SS" in Asia/Shanghai (CST), matching the header's nowStr(). */
export function nowCst(): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(new Date());
}

/** Relative Chinese time from a past epoch (ms or s). */
export function relTimeZh(epoch: number): string {
  const ms = epoch < 1e12 ? epoch * 1000 : epoch;
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  return `${Math.floor(hr / 24)}天前`;
}
