/** Strip the YouTube host from a channel URL for display, keeping @handles. */
export function prettyChannel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@/, '@') || url;
}

/** Compact relative time, e.g. "just now", "12m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
