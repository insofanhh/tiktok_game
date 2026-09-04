import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const runtimeSettingsSchema = z.object({
  mode: z.enum(['mock', 'live']),
  username: z.string().max(100),
  roundDurationMinutes: z.number().int().min(1).max(120).default(10),
});

export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

export class RuntimeSettingsStore {
  private readonly filePath: string;

  constructor(fileUrl: URL) {
    this.filePath = fileURLToPath(fileUrl);
  }

  async load(fallback: RuntimeSettings): Promise<RuntimeSettings> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      return runtimeSettingsSchema.parse(JSON.parse(content));
    } catch (error: unknown) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code !== 'ENOENT') console.warn('Không thể đọc runtime settings, dùng cấu hình mặc định');
      return fallback;
    }
  }

  async save(settings: RuntimeSettings): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}

export function normalizeTikTokUsername(value: string): string {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/tiktok\.com\/@([^/?#]+)/i);
  const username = urlMatch?.[1] ?? trimmed.replace(/^@/, '');
  return decodeURIComponent(username).trim();
}
