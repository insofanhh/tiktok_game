'use client';

import { CheckCircle2, Clock3, LoaderCircle, Radio, Settings, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RuntimeSourceSettings, SourceStatus } from '@/lib/game-types';

interface SettingsPanelProps {
  serverUrl: string;
  connection: 'connecting' | 'online' | 'offline';
  source: SourceStatus;
}

type SettingsResponse = RuntimeSourceSettings & { error?: string };

export function SettingsPanel({ serverUrl, connection, source }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [roundDurationInput, setRoundDurationInput] = useState('10');
  const [hasEulerApiKey, setHasEulerApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setFeedback(null);

    void fetch(`${serverUrl}/api/settings`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await readSettingsResponse(response);
        if (!response.ok) throw new Error(payload.error ?? 'Không thể tải cấu hình từ backend');
        return payload;
      })
      .then((settings) => {
        setUsername(settings.username);
        setRoundDurationInput(String(settings.roundDurationMinutes ?? 10));
        setHasEulerApiKey(settings.hasEulerApiKey);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFeedback({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Backend chưa sẵn sàng',
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, serverUrl]);

  const updateSource = async (mode: 'mock' | 'live') => {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`${serverUrl}/api/settings/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, username }),
      });
      const payload = await readSettingsResponse(response);
      if (!response.ok) throw new Error(payload.error ?? 'Không thể cập nhật nguồn TikTok');

      setUsername(payload.username);
      setRoundDurationInput(String(payload.roundDurationMinutes ?? 10));
      setHasEulerApiKey(payload.hasEulerApiKey);
      setFeedback({
        kind: 'success',
        message: mode === 'live'
          ? `Đã kết nối TikTok @${payload.username}`
          : 'Đã chuyển sang chế độ Mock',
      });
    } catch (error: unknown) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Không thể kết nối backend',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveRoundDuration = async () => {
    const roundDurationMinutes = Number(roundDurationInput);
    if (!Number.isInteger(roundDurationMinutes) || roundDurationMinutes < 1 || roundDurationMinutes > 120) {
      setFeedback({ kind: 'error', message: 'Thời gian mỗi vòng phải từ 1 đến 120 phút' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`${serverUrl}/api/settings/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundDurationMinutes }),
      });
      const payload = await readSettingsResponse(response);
      if (!response.ok) throw new Error(payload.error ?? 'Không thể lưu thời gian vòng');

      setRoundDurationInput(String(payload.roundDurationMinutes));
      setFeedback({
        kind: 'success',
        message: `Đã đặt ${payload.roundDurationMinutes} phút và bắt đầu vòng mới`,
      });
    } catch (error: unknown) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Không thể kết nối backend',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLiveSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void updateSource('live');
  };

  const backendOnline = connection === 'online';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="icon-lg"
            variant="outline"
            className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
            aria-label="Mở cài đặt TikTok Live"
          />
        }
      >
        <Settings className="h-4 w-4" />
      </DialogTrigger>

      <DialogContent className="border border-white/15 bg-[#0b111b] text-slate-100 ring-0 sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black tracking-wide text-white">
            <Radio className="h-5 w-5 text-rose-400" /> CÀI ĐẶT GAME &amp; LIVE
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Thiết lập thời gian mỗi vòng và tài khoản TikTok Live. Backend sẽ lưu lại để dùng sau khi khởi động lại.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleLiveSubmit}>
          <div className="space-y-2">
            <Label htmlFor="tiktok-username" className="text-slate-200">Username TikTok đang live</Label>
            <Input
              id="tiktok-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="@username hoặc link TikTok Live"
              autoComplete="off"
              spellCheck={false}
              disabled={loading || saving || !backendOnline}
              className="h-10 border-white/15 bg-black/25 text-white placeholder:text-slate-600 focus-visible:border-cyan-400"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="round-duration" className="flex items-center gap-2 text-slate-200">
              <Clock3 className="h-4 w-4 text-amber-300" /> Thời gian sinh tồn mỗi vòng
            </Label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="relative">
                <Input
                  id="round-duration"
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  inputMode="numeric"
                  value={roundDurationInput}
                  onChange={(event) => setRoundDurationInput(event.target.value)}
                  disabled={loading || saving || !backendOnline}
                  className="h-10 border-white/15 bg-black/25 pr-14 text-white focus-visible:border-amber-300"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-slate-500">
                  PHÚT
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={saving || loading || !backendOnline || !roundDurationInput}
                onClick={() => void saveRoundDuration()}
                className="border-amber-300/30 bg-amber-300/10 font-bold text-amber-200 hover:bg-amber-300/20 hover:text-amber-100"
              >
                Lưu thời gian
              </Button>
            </div>
            <p className="text-xs text-slate-500">Từ 1–120 phút. Lưu sẽ bắt đầu vòng mới, hồi sinh mọi người và xóa điểm vòng hiện tại.</p>
          </div>

          <div className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
            <StatusLine ok={backendOnline} label={backendOnline ? 'Backend đang hoạt động' : 'Backend chưa kết nối'} />
            <StatusLine ok={hasEulerApiKey} label={hasEulerApiKey ? 'Euler API key đã cấu hình' : 'Euler API key chưa cấu hình'} />
            <StatusLine ok={source.connected} label={source.label} />
          </div>

          {feedback && (
            <p
              className={feedback.kind === 'success'
                ? 'flex items-start gap-2 text-sm text-emerald-300'
                : 'flex items-start gap-2 text-sm text-rose-300'}
              role="status"
              aria-live="polite"
            >
              {feedback.kind === 'success'
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
              {feedback.message}
            </p>
          )}

          <DialogFooter className="border-white/10 bg-white/[0.03]">
            <Button
              type="button"
              variant="outline"
              disabled={saving || loading || !backendOnline}
              onClick={() => void updateSource('mock')}
              className="border-white/15 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white"
            >
              Dùng Mock
            </Button>
            <Button
              type="submit"
              disabled={saving || loading || !backendOnline || !username.trim() || !hasEulerApiKey}
              className="bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300"
            >
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Lưu &amp; kết nối Live
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function readSettingsResponse(response: Response): Promise<SettingsResponse> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    if (response.status === 404) {
      throw new Error('Backend đang chạy phiên bản cũ. Cần khởi động lại backend để lưu thời gian vòng.');
    }
    throw new Error('Backend trả về dữ liệu không hợp lệ. Vui lòng kiểm tra lại máy chủ game.');
  }

  try {
    return await response.json() as SettingsResponse;
  } catch {
    throw new Error('Không đọc được phản hồi từ backend. Vui lòng thử lại.');
  }
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={ok ? 'h-2 w-2 rounded-full bg-emerald-400' : 'h-2 w-2 rounded-full bg-amber-400'} />
      {label}
    </span>
  );
}
