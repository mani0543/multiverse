export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatChatDividerDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatLastSeen(lastSeenTimestamp?: number, isOnline?: boolean): string {
  if (isOnline) return 'Online';
  if (!lastSeenTimestamp) return 'Offline';

  const diffSeconds = Math.floor((Date.now() - lastSeenTimestamp) / 1000);
  if (diffSeconds < 60) return 'Last seen just now';
  if (diffSeconds < 3600) return `Last seen ${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `Last seen ${Math.floor(diffSeconds / 3600)}h ago`;
  return `Last seen ${new Date(lastSeenTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}
