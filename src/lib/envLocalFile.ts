import fs from 'fs';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env.local');

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) return null;

  const key = trimmed.slice(0, eqIndex).trim();
  let value = trimmed.slice(eqIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function readEnvLocal(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};

  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const parsed = parseEnvLine(line);
    if (parsed) result[parsed.key] = parsed.value;
  }

  return result;
}

/** Aktualizuje nebo přidá klíče v .env.local (zachová ostatní řádky) */
export function updateEnvLocal(updates: Record<string, string>): void {
  const lines = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, 'utf-8').split('\n')
    : [];

  const updatedKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || !(parsed.key in updates)) return line;

    updatedKeys.add(parsed.key);
    const escaped = updates[parsed.key].replace(/"/g, '\\"');
    return `${parsed.key}="${escaped}"`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      const escaped = value.replace(/"/g, '\\"');
      newLines.push(`${key}="${escaped}"`);
    }
  }

  const output = newLines.join('\n').replace(/\n+$/, '') + '\n';
  fs.writeFileSync(ENV_PATH, output, 'utf-8');
}

export function getEnvLocalPath(): string {
  return ENV_PATH;
}
