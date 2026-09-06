'use client';
import { useState } from 'react';
export function Avatar({ name, url, className = '' }: { name: string; url?: string; className?: string }) {
  const [failed, setFailed] = useState<string>();
  const initials = name.trim().split(/\s+/).slice(-2).map(p => p[0]).join('').toUpperCase();
  return <span className={'player-avatar ' + className}>
    {url && failed !== url
      ? <img src={url} alt={name} referrerPolicy="no-referrer" onError={() => setFailed(url)} />
      : <span aria-label={name}>{initials || '?'}</span>}
  </span>;
}
