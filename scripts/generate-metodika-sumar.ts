/**
 * Vygeneruje METODIKA_SUMAR.txt z metodických složek projektu.
 * Spuštění: npx tsx scripts/generate-metodika-sumar.ts
 */
import fs from 'fs';
import path from 'path';

import { parseMethodologyBuffer } from '../src/lib/methodology/parseServerFile';

const PROJECT_ROOT = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'METODIKA_SUMAR.txt');

const METHODOLOGY_DIRS = [
  path.join(PROJECT_ROOT, 'data', 'methodology'),
  path.join(PROJECT_ROOT, 'methodology'),
  path.join(PROJECT_ROOT, 'knowledge'),
];

const SUPPORTED = new Set(['.txt', '.md', '.pdf']);

const BALAST_KEYWORDS =
  /strav|výživ|psycholog|mentál|mindset|motivac|spánek|regenerace(?!\s*(klus|den|týden|mikro))|wellness|hydrat|suplement|vitamin|protein|sacharid/i;

interface FileEntry {
  label: string;
  absolutePath: string;
}

function collectFiles(dir: string, rootLabel: string): FileEntry[] {
  const result: FileEntry[] = [];
  if (!fs.existsSync(dir)) return result;

  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!SUPPORTED.has(path.extname(entry.name).toLowerCase())) continue;
      result.push({
        label: `${rootLabel}/${path.relative(dir, absolutePath).replace(/\\/g, '/')}`,
        absolutePath,
      });
    }
  };

  walk(dir);
  return result;
}

function discoverSourceFiles(): FileEntry[] {
  const seen = new Set<string>();
  const all: FileEntry[] = [];

  for (const dir of METHODOLOGY_DIRS) {
    const rootLabel = path.relative(PROJECT_ROOT, dir).replace(/\\/g, '/') || dir;
    for (const file of collectFiles(dir, rootLabel)) {
      if (seen.has(file.absolutePath)) continue;
      seen.add(file.absolutePath);
      all.push(file);
    }
  }

  return all.sort((a, b) => a.label.localeCompare(b.label, 'cs'));
}

function splitTrainingAndBalast(content: string): { training: string; balast: string[] } {
  const sections = content.split(/\n(?=#{1,3}\s)/);
  const trainingParts: string[] = [];
  const balastLines: string[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const firstLine = trimmed.split('\n')[0] ?? '';
    const isBalast =
      BALAST_KEYWORDS.test(firstLine) ||
      BALAST_KEYWORDS.test(trimmed.slice(0, 300));

    if (isBalast) {
      const bullets = trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('•'))
        .slice(0, 2);
      if (bullets.length) balastLines.push(...bullets);
      else balastLines.push(`- ${firstLine.replace(/^#+\s*/, '').slice(0, 120)}`);
    } else {
      trainingParts.push(trimmed);
    }
  }

  return { training: trainingParts.join('\n\n'), balast: balastLines };
}

async function readSourceFile(entry: FileEntry): Promise<string> {
  const buffer = fs.readFileSync(entry.absolutePath);
  const { content } = await parseMethodologyBuffer(buffer, path.basename(entry.absolutePath));
  return content.trim();
}

async function main(): Promise<void> {
  const files = discoverSourceFiles();
  const trainingSections: string[] = [];
  const balastBullets: string[] = [];

  trainingSections.push(`# METODIKA_SUMAR – tréninková metodika (auto-generováno)
Generováno: ${new Date().toISOString()}
Zdrojové složky: data/methodology, methodology, knowledge
`);

  if (files.length === 0) {
    trainingSections.push('(Ve složkách metodiky nebyly nalezeny žádné soubory.)');
  }

  for (const file of files) {
    try {
      const raw = await readSourceFile(file);
      const { training, balast } = splitTrainingAndBalast(raw);
      if (training.trim()) {
        trainingSections.push(`## Zdroj: ${file.label}\n${training.trim()}`);
      }
      balastBullets.push(...balast);
    } catch (error) {
      console.warn(`[generate-metodika-sumar] Skip ${file.label}:`, error);
    }
  }

  const uniqueBalast = [...new Set(balastBullets)].slice(0, 5);
  const balastBlock =
    uniqueBalast.length > 0
      ? `\n\n## Doplňkové poznámky (strava / psychologie / regenerace – zkráceno)\n${uniqueBalast.join('\n')}`
      : `\n\n## Doplňkové poznámky (strava / psychologie / regenerace – zkráceno)
- Dostatečný spánek a hydratace podporují adaptaci – detaily mimo scope metodiky.
- Strava: individuální, bez rigidních diet – doplň glykogen po dlouhých bězích.
- Psychologie: procesní cíle, ne extrémní tlak před závodem.
- Regenerace: 1 lehký den/týden stačí; volno až při TSB < -30 nebo nemoci.
- Po hard session min. 48 h do další kvalitní jednotky (Seiler).`;

  const output = `${trainingSections.join('\n\n')}${balastBlock}\n`;
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
  console.log(`✓ ${OUTPUT_FILE} (${output.length.toLocaleString('cs-CZ')} znaků, ${files.length} souborů)`);
}

void main();
