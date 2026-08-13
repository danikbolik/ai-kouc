export type PaceZoneId = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

export interface PaceZone {
  zone: PaceZoneId;
  /** Pomalejší hranice tempa (min/km), např. "5:30" */
  minPace?: string;
  /** Rychlejší hranice tempa (min/km), např. "5:00" */
  maxPace?: string;
  /** Čitelný popis, např. ">5:30" nebo "5:00-5:30" */
  label: string;
}

export interface HrZone {
  zone: PaceZoneId;
  /** Popis zóny, např. Regenerace, Aerobní základ */
  description: string;
  /** Spodní hranice BPM (včetně) – prázdné u Z1 */
  minBpm?: number;
  /** Horní hranice BPM (včetně) – prázdné u Z5 */
  maxBpm?: number;
  /** Čitelný rozsah, např. "<130" nebo "130–145" */
  label: string;
}

export interface UserMetrics {
  HRmax: number;
  ANP: number;
  AeT?: number;
  targetRace: string;
  raceDate?: string;
  raceDistanceKm?: number;
  paceZones?: PaceZone[];
  hrZones?: HrZone[];
  /** Pondělí startu aktuálního 3+1 mesocyklu (YYYY-MM-DD) */
  mesocycleStartDate?: string;
}

export interface UploadedMethodology {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'txt' | 'md';
  uploadedAt: string;
  content: string;
  charCount: number;
}

export const DEFAULT_PACE_ZONES: PaceZone[] = [
  { zone: 'Z1', maxPace: '5:30', label: '>5:30' },
  { zone: 'Z2', minPace: '5:00', maxPace: '5:30', label: '5:00-5:30' },
  { zone: 'Z3', minPace: '4:30', maxPace: '5:00', label: '4:30-5:00' },
  { zone: 'Z4', minPace: '3:55', maxPace: '4:30', label: '3:55-4:30' },
  { zone: 'Z5', minPace: '3:55', label: '<3:55' },
];

export const DEFAULT_HR_ZONES: HrZone[] = [
  { zone: 'Z1', description: 'Regenerace', maxBpm: 129, label: '<130' },
  { zone: 'Z2', description: 'Aerobní základ', minBpm: 130, maxBpm: 145, label: '130–145' },
  { zone: 'Z3', description: 'Tempo', minBpm: 146, maxBpm: 160, label: '146–160' },
  { zone: 'Z4', description: 'Prahová / ANP', minBpm: 161, maxBpm: 172, label: '161–172' },
  { zone: 'Z5', description: 'VO2max / Maximální', minBpm: 173, label: '>172' },
];

export const DEFAULT_USER_METRICS: UserMetrics = {
  HRmax: 192,
  ANP: 172,
  AeT: 155,
  targetRace: 'Prague Half Marathon',
  raceDate: '2026-09-06',
  raceDistanceKm: 21.1,
  paceZones: DEFAULT_PACE_ZONES,
  hrZones: DEFAULT_HR_ZONES,
};

export function formatPaceZoneForDisplay(zone: PaceZone): string {
  if (zone.label.trim()) return zone.label;
  if (zone.minPace && zone.maxPace) return `${zone.minPace}-${zone.maxPace}`;
  if (zone.maxPace) return `>${zone.maxPace}`;
  if (zone.minPace) return `<${zone.minPace}`;
  return '—';
}

export function formatHrZoneForDisplay(zone: HrZone): string {
  if (zone.label.trim()) return zone.label;
  if (zone.minBpm !== undefined && zone.maxBpm !== undefined) {
    return `${zone.minBpm}–${zone.maxBpm} bpm`;
  }
  if (zone.maxBpm !== undefined) return `<${zone.maxBpm + 1} bpm`;
  if (zone.minBpm !== undefined) return `>${zone.minBpm - 1} bpm`;
  return '—';
}

/** Odvozené zóny z prahů – fallback pro starší profily bez hrZones */
export function deriveHrZonesFromThresholds(userMetrics: UserMetrics): HrZone[] {
  const max = userMetrics.HRmax;
  const aet = userMetrics.AeT ?? Math.round(max * 0.75);
  const anp = userMetrics.ANP;
  const z1Max = Math.round(max * 0.65);
  const z4Max = Math.round(max * 0.95);

  return [
    { zone: 'Z1', description: 'Regenerace', maxBpm: z1Max, label: `≤${z1Max}` },
    {
      zone: 'Z2',
      description: 'Aerobní základ',
      minBpm: z1Max + 1,
      maxBpm: aet,
      label: `${z1Max + 1}–${aet}`,
    },
    {
      zone: 'Z3',
      description: 'Tempo',
      minBpm: aet + 1,
      maxBpm: anp,
      label: `${aet + 1}–${anp}`,
    },
    {
      zone: 'Z4',
      description: 'Prahová / ANP',
      minBpm: anp + 1,
      maxBpm: z4Max,
      label: `${anp + 1}–${z4Max}`,
    },
    {
      zone: 'Z5',
      description: 'VO2max / Maximální',
      minBpm: z4Max + 1,
      label: `>${z4Max}`,
    },
  ];
}

export function getEffectiveHrZones(userMetrics: UserMetrics): HrZone[] {
  if (userMetrics.hrZones?.length === 5) return userMetrics.hrZones;
  return deriveHrZonesFromThresholds(userMetrics);
}

export function bpmMatchesHrZone(hr: number, zone: HrZone): boolean {
  if (zone.minBpm !== undefined && hr < zone.minBpm) return false;
  if (zone.maxBpm !== undefined && hr > zone.maxBpm) return false;
  return true;
}

export function classifyBpmToHrZone(
  hr: number,
  userMetrics: UserMetrics,
): PaceZoneId | 'neznámá' {
  if (hr <= 0) return 'neznámá';
  const zones = getEffectiveHrZones(userMetrics);
  const match = zones.find((zone) => bpmMatchesHrZone(hr, zone));
  return match?.zone ?? 'neznámá';
}

export function formatBpmWithHrZone(hr: number, userMetrics: UserMetrics): string {
  const zone = classifyBpmToHrZone(hr, userMetrics);
  if (zone === 'neznámá') return `TF ${hr} (zóna neznámá)`;
  const zoneDef = getEffectiveHrZones(userMetrics).find((z) => z.zone === zone);
  const range = zoneDef ? formatHrZoneForDisplay(zoneDef) : '';
  return `TF ${hr} = ${zone}${range ? ` (${range})` : ''}`;
}
