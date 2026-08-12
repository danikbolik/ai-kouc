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

export interface UserMetrics {
  HRmax: number;
  ANP: number;
  AeT?: number;
  targetRace: string;
  raceDate?: string;
  raceDistanceKm?: number;
  paceZones?: PaceZone[];
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

export const DEFAULT_USER_METRICS: UserMetrics = {
  HRmax: 192,
  ANP: 172,
  AeT: 155,
  targetRace: 'Prague Half Marathon',
  raceDate: '2026-09-06',
  raceDistanceKm: 21.1,
  paceZones: DEFAULT_PACE_ZONES,
};

export function formatPaceZoneForDisplay(zone: PaceZone): string {
  if (zone.label.trim()) return zone.label;
  if (zone.minPace && zone.maxPace) return `${zone.minPace}-${zone.maxPace}`;
  if (zone.maxPace) return `>${zone.maxPace}`;
  if (zone.minPace) return `<${zone.minPace}`;
  return '—';
}
