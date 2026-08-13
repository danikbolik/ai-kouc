'use client';

import { useEffect, useState } from 'react';
import {
  createUploadedMethodology,
  formatFileSize,
  isSupportedMethodologyFile,
  readMethodologyFile,
} from '../../lib/readMethodologyFile';
import { getOrCreateUserId } from '../../lib/userId';
import {
  DEFAULT_HR_ZONES,
  DEFAULT_PACE_ZONES,
  type HrZone,
  type PaceZone,
} from '../../types/settings';
import { CoachNotesPanel } from '../settings/CoachNotesPanel';
import { StravaSettings } from '../settings/StravaSettings';
import { useTrainingStore } from '../../store/useTrainingStore';

type SettingsSection = 'personal' | 'methodology' | 'memory' | 'strava' | 'integrations';

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'personal', label: 'Osobní parametry' },
  { id: 'methodology', label: 'Metodika & Podklady' },
  { id: 'memory', label: '🧠 Paměť trenéra' },
  { id: 'strava', label: 'Strava Integrace' },
  { id: 'integrations', label: 'Integrace / API' },
];

function KeyStatus({ configured }: { configured: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 text-xs font-medium',
        configured ? 'text-emerald-600' : 'text-red-500',
      ].join(' ')}
    >
      {configured ? '🟢 Klíč uložen' : '🔴 Chybí API klíč'}
    </span>
  );
}

export function SettingsDrawer() {
  const isSettingsOpen = useTrainingStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useTrainingStore((s) => s.setSettingsOpen);
  const storedApiKeys = useTrainingStore((s) => s.apiKeys);
  const setApiKeys = useTrainingStore((s) => s.setApiKeys);
  const storedUserMetrics = useTrainingStore((s) => s.userMetrics);
  const setUserMetrics = useTrainingStore((s) => s.setUserMetrics);
  const uploadedMethodology = useTrainingStore((s) => s.uploadedMethodology);
  const addUploadedMethodology = useTrainingStore((s) => s.addUploadedMethodology);
  const removeUploadedMethodology = useTrainingStore((s) => s.removeUploadedMethodology);

  const [activeSection, setActiveSection] = useState<SettingsSection>('personal');

  const [hrMax, setHrMax] = useState(String(storedUserMetrics.HRmax));
  const [aetThreshold, setAetThreshold] = useState(String(storedUserMetrics.AeT ?? 155));
  const [antThreshold, setAntThreshold] = useState(String(storedUserMetrics.ANP));
  const [raceName, setRaceName] = useState(storedUserMetrics.targetRace);
  const [raceDate, setRaceDate] = useState(storedUserMetrics.raceDate ?? '2026-09-06');
  const [raceDistance, setRaceDistance] = useState(
    String(storedUserMetrics.raceDistanceKm ?? 21.1),
  );
  const [paceZones, setPaceZones] = useState<PaceZone[]>(
    storedUserMetrics.paceZones ?? DEFAULT_PACE_ZONES,
  );
  const [hrZones, setHrZones] = useState<HrZone[]>(
    storedUserMetrics.hrZones ?? DEFAULT_HR_ZONES,
  );

  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [metricsSaveFeedback, setMetricsSaveFeedback] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!isSettingsOpen) return;

    setOpenaiApiKey(storedApiKeys.openaiApiKey);
    setHrMax(String(storedUserMetrics.HRmax));
    setAetThreshold(String(storedUserMetrics.AeT ?? 155));
    setAntThreshold(String(storedUserMetrics.ANP));
    setRaceName(storedUserMetrics.targetRace);
    setRaceDate(storedUserMetrics.raceDate ?? '2026-09-06');
    setRaceDistance(String(storedUserMetrics.raceDistanceKm ?? 21.1));
    setPaceZones(storedUserMetrics.paceZones ?? DEFAULT_PACE_ZONES);
    setHrZones(storedUserMetrics.hrZones ?? DEFAULT_HR_ZONES);
    setMetricsSaveFeedback(null);
    setUploadError(null);
    setSaveFeedback(null);
  }, [isSettingsOpen, storedApiKeys, storedUserMetrics]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen, setSettingsOpen]);

  const handleSaveApiKeys = () => {
    setApiKeys({
      openaiApiKey: openaiApiKey.trim(),
    });
    setSaveFeedback('OpenAI klíč uložen do prohlížeče.');
    setTimeout(() => setSaveFeedback(null), 3000);
  };

  const handleSaveUserMetrics = () => {
    setUserMetrics({
      HRmax: Number(hrMax) || 192,
      AeT: Number(aetThreshold) || 155,
      ANP: Number(antThreshold) || 172,
      targetRace: raceName.trim() || 'Prague Half Marathon',
      raceDate: raceDate || undefined,
      raceDistanceKm: Number(raceDistance) || 21.1,
      paceZones,
      hrZones,
    });
    setMetricsSaveFeedback('Parametry uloženy do prohlížeče.');
    setTimeout(() => setMetricsSaveFeedback(null), 3000);
  };

  const handleFilesUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      for (const file of fileArray) {
        if (!isSupportedMethodologyFile(file)) {
          throw new Error(`Soubor "${file.name}" není podporovaný (.pdf, .txt, .md).`);
        }

        const { fileType, content } = await readMethodologyFile(file);
        addUploadedMethodology(createUploadedMethodology(file.name, fileType, content));
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Nahrání souboru selhalo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    await handleFilesUpload(e.dataTransfer.files);
  };

  const openAiConfigured = Boolean(storedApiKeys.openaiApiKey.trim());

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Zavřít nastavení"
        onClick={() => setSettingsOpen(false)}
      />

      <aside
        className="drawer-panel relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="settings-title" className="text-lg font-semibold text-slate-900">
            Nastavení
          </h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Zavřít"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 py-2">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={[
                'shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                activeSection === section.id
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
              ].join(' ')}
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {activeSection === 'personal' && (
            <section className="space-y-5">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Tělesné parametry
                </h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      HRmax (bpm)
                    </span>
                    <input
                      type="number"
                      value={hrMax}
                      onChange={(e) => setHrMax(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Aerobní práh AeT (bpm)
                    </span>
                    <input
                      type="number"
                      value={aetThreshold}
                      onChange={(e) => setAetThreshold(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Anaerobní práh AnT (bpm)
                    </span>
                    <input
                      type="number"
                      value={antThreshold}
                      onChange={(e) => setAntThreshold(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Cílový závod</h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Název závodu
                    </span>
                    <input
                      type="text"
                      value={raceName}
                      onChange={(e) => setRaceName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Datum
                    </span>
                    <input
                      type="date"
                      value={raceDate}
                      onChange={(e) => setRaceDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Vzdálenost (km)
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      value={raceDistance}
                      onChange={(e) => setRaceDistance(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Tempové zóny (min/km)
                </h3>
                <p className="mb-3 text-xs text-slate-500">
                  AI používá tyto rozsahy pro vyhodnocení tempa běhů a návrh tréninků.
                </p>
                <div className="space-y-2">
                  {paceZones.map((zone, index) => (
                    <div
                      key={zone.zone}
                      className="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2"
                    >
                      <span className="text-xs font-bold text-slate-700">{zone.zone}</span>
                      <input
                        type="text"
                        placeholder="min (např. 5:00)"
                        value={zone.minPace ?? ''}
                        onChange={(e) => {
                          const next = [...paceZones];
                          next[index] = { ...zone, minPace: e.target.value || undefined };
                          setPaceZones(next);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="max (např. 5:30)"
                        value={zone.maxPace ?? ''}
                        onChange={(e) => {
                          const next = [...paceZones];
                          next[index] = { ...zone, maxPace: e.target.value || undefined };
                          setPaceZones(next);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Popis (>5:30)"
                        value={zone.label}
                        onChange={(e) => {
                          const next = [...paceZones];
                          next[index] = { ...zone, label: e.target.value };
                          setPaceZones(next);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Tepové zóny (BPM)
                </h3>
                <p className="mb-3 text-xs text-slate-500">
                  AI vyhodnocuje každý běh striktně podle těchto tepových rozsahů – nesmí zaměňovat
                  zóny (např. TF 165 ≠ Z1–Z2).
                </p>
                <div className="mb-2 grid grid-cols-[2.5rem_1fr_4rem_4rem_1fr] gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>Zóna</span>
                  <span>Typ</span>
                  <span>Min</span>
                  <span>Max</span>
                  <span>Rozsah</span>
                </div>
                <div className="space-y-2">
                  {hrZones.map((zone, index) => (
                    <div
                      key={zone.zone}
                      className="grid grid-cols-[2.5rem_1fr_4rem_4rem_1fr] items-center gap-2"
                    >
                      <span className="text-xs font-bold text-slate-700">{zone.zone}</span>
                      <span className="text-xs text-slate-600">{zone.description}</span>
                      <input
                        type="number"
                        placeholder="—"
                        value={zone.minBpm ?? ''}
                        onChange={(e) => {
                          const next = [...hrZones];
                          const raw = e.target.value.trim();
                          next[index] = {
                            ...zone,
                            minBpm: raw ? Number(raw) : undefined,
                          };
                          setHrZones(next);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="—"
                        value={zone.maxBpm ?? ''}
                        onChange={(e) => {
                          const next = [...hrZones];
                          const raw = e.target.value.trim();
                          next[index] = {
                            ...zone,
                            maxBpm: raw ? Number(raw) : undefined,
                          };
                          setHrZones(next);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="<130"
                        value={zone.label}
                        onChange={(e) => {
                          const next = [...hrZones];
                          next[index] = { ...zone, label: e.target.value };
                          setHrZones(next);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveUserMetrics}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Uložit parametry
              </button>
              {metricsSaveFeedback && (
                <p className="text-center text-xs font-medium text-emerald-600">
                  {metricsSaveFeedback}
                </p>
              )}
            </section>
          )}

          {activeSection === 'methodology' && (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Metodika & Podklady</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Nahrané texty se ukládají lokálně a slouží jako primární metodický kontext pro
                  AI chat a přepočet plánu.
                </p>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={[
                  'rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                  isDragOver
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50',
                ].join(' ')}
              >
                <p className="text-sm font-medium text-slate-700">
                  Přetáhni soubory sem nebo vyber z disku
                </p>
                <p className="mt-1 text-xs text-slate-500">Podporované formáty: .pdf, .txt, .md</p>
                <label className="mt-4 inline-block cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700">
                  {isUploading ? 'Načítám…' : 'Vybrat soubory'}
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                    multiple
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      if (e.target.files) void handleFilesUpload(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              {uploadError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{uploadError}</p>
              )}

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nahrané dokumenty ({uploadedMethodology.length})
                </h4>

                {uploadedMethodology.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    Zatím žádné metodické podklady. Nahraj PDF, TXT nebo MD soubor.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {uploadedMethodology.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {doc.fileName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {doc.fileType.toUpperCase()} · {formatFileSize(doc.charCount)} ·{' '}
                            {new Date(doc.uploadedAt).toLocaleDateString('cs-CZ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Indexováno
                          </span>
                          <button
                            type="button"
                            onClick={() => removeUploadedMethodology(doc.id)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Smazat ${doc.fileName}`}
                          >
                            Smazat
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {activeSection === 'memory' && <CoachNotesPanel />}

          {activeSection === 'strava' && (
            <StravaSettings active={isSettingsOpen && activeSection === 'strava'} />
          )}

          {activeSection === 'integrations' && (
            <section className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">API klíče</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    OpenAI klíč a tréninková data se synchronizují do cloudu (Supabase), pokud je
                    nakonfigurován. Strava se propojuje v záložce Strava Integrace.
                  </p>
                  <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-[10px] text-slate-600">
                    Cloud ID tohoto zařízení:{' '}
                    <span className="font-mono font-semibold">{getOrCreateUserId()}</span>
                  </p>
                </div>

                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">OpenAI API Key</span>
                      <KeyStatus configured={openAiConfigured} />
                    </div>
                    <div className="relative">
                      <input
                        type={showOpenAiKey ? 'text' : 'password'}
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder="sk-..."
                        autoComplete="off"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenAiKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                        aria-label={showOpenAiKey ? 'Skrýt klíč' : 'Zobrazit klíč'}
                      >
                        👁️
                      </button>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={handleSaveApiKeys}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Uložit OpenAI klíč
                  </button>

                  {saveFeedback && (
                    <p className="text-center text-xs font-medium text-emerald-600">
                      {saveFeedback}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
