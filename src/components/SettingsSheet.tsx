import { useRef, useState } from 'react';
import { createBackup, parseBackup, BackupError } from '../lib/backup';
import { todayKey } from '../lib/dates';
import type { BurnData, WeightData } from '../lib/db';
import type { JourneySettings } from '../lib/journey';
import type { Entry, Habit } from '../lib/types';
import { ChevronDown, ChevronRight, ChevronUp, Download, Reorder, Upload } from './icons';
import { Sheet, useConfirm } from './Sheet';

interface SettingsProps {
  habits: Habit[];
  getEntries: () => Entry[];
  weight: WeightData;
  burn: BurnData;
  journey: JourneySettings | null;
  onImport: (
    habits: Habit[],
    entries: Entry[],
    weight?: WeightData,
    burn?: BurnData,
    journey?: JourneySettings | null,
  ) => Promise<void>;
  onReorder: () => void;
  notify: (message: string) => void;
  onClose: () => void;
}

export function SettingsSheet(props: SettingsProps) {
  return (
    <Sheet title="Settings" onClose={props.onClose}>
      <Settings {...props} />
    </Sheet>
  );
}

async function shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  // On iPhone the share sheet ("Save to Files") is the most reliable way to keep a file.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Habits backup' });
      return 'shared';
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

function Settings({ habits, getEntries, weight, burn, journey, onImport, onReorder, notify }: SettingsProps) {
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const exportBackup = async () => {
    setError('');
    const json = JSON.stringify(createBackup(habits, getEntries(), weight, burn, journey), null, 1);
    const file = new File([json], `habits-backup-${todayKey()}.json`, { type: 'application/json' });
    const result = await shareOrDownload(file);
    if (result !== 'cancelled') notify('Backup exported');
  };

  const importBackup = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const data = parseBackup(await file.text());
      const ok = await confirm({
        title: 'Replace all data?',
        message:
          `This replaces your ${habits.length} current habit${habits.length === 1 ? '' : 's'} with ${data.habits.length} habit${data.habits.length === 1 ? '' : 's'} and ${data.entries.length} record${data.entries.length === 1 ? '' : 's'} from the backup.` +
          (data.weight
            ? ` Weight data is replaced with ${data.weight.entries.length} weight entr${data.weight.entries.length === 1 ? 'y' : 'ies'}.`
            : ' This backup has no weight data, so your current weight data is kept.') +
          (data.burn
            ? ` Calorie burn data is replaced with ${data.burn.entries.length} entr${data.burn.entries.length === 1 ? 'y' : 'ies'}.`
            : ' This backup has no calorie burn data, so your current burn data is kept.') +
          (data.journey !== undefined
            ? data.journey
              ? ` Your journey is replaced with “${data.journey.name}”.`
              : ' Your current journey is cleared.'
            : ' This backup has no journey, so your current journey is kept.'),
        confirmLabel: 'Replace',
        destructive: true,
      });
      if (!ok) return;
      await onImport(data.habits, data.entries, data.weight, data.burn, data.journey);
      notify('Backup restored');
    } catch (err) {
      setError(
        err instanceof BackupError
          ? `${err.message} Your current data was not changed.`
          : 'The backup could not be imported. Your current data was not changed.',
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="settings">
      <div className="group">
        <button type="button" className="row-btn" onClick={onReorder} disabled={habits.length < 2}>
          <Reorder />
          <span>Reorder Habits</span>
          <ChevronRight size={18} className="row-chevron" />
        </button>
      </div>

      <h3 className="group-title">Backup</h3>
      <div className="group">
        <button type="button" className="row-btn" onClick={exportBackup}>
          <Download />
          <span>Export Backup</span>
        </button>
        <button type="button" className="row-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload />
          <span>{busy ? 'Importing…' : 'Import Backup'}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importBackup(file);
          }}
        />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="helper">
        Your data lives only on this iPhone. iOS can clear website data, so export a backup regularly and keep
        it in Files or iCloud Drive.
      </p>

      <h3 className="group-title">About</h3>
      <dl className="info-list group">
        <div>
          <dt>App</dt>
          <dd>Habits {__APP_VERSION__}</dd>
        </div>
        <div>
          <dt>Day boundary</dt>
          <dd>Midnight, Kuwait time</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>On this device</dd>
        </div>
      </dl>
      <p className="helper">
        No account, no tracking, no network. Works offline once installed. To install, open in Safari, tap
        Share, then “Add to Home Screen”.
      </p>
    </div>
  );
}

/* ---------- Reorder ---------- */

interface ReorderProps {
  habits: Habit[];
  onReorder: (habits: Habit[]) => void;
  onClose: () => void;
}

export function ReorderSheet({ habits, onReorder, onClose }: ReorderProps) {
  const move = (from: number, to: number) => {
    const next = [...habits];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder(next);
  };
  return (
    <Sheet title="Reorder Habits" onClose={onClose}>
      <ol className="reorder-list">
        {habits.map((h, i) => (
          <li key={h.id}>
            <span className="habit-icon" aria-hidden="true">
              {h.icon}
            </span>
            <span className="reorder-name">{h.name}</span>
            <button
              type="button"
              className="icon-btn small"
              aria-label={`Move ${h.name} up`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              <ChevronUp size={18} />
            </button>
            <button
              type="button"
              className="icon-btn small"
              aria-label={`Move ${h.name} down`}
              disabled={i === habits.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <ChevronDown size={18} />
            </button>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
