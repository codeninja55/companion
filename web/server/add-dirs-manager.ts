import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AddDirsPreset {
  name: string;
  slug: string;
  directories: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AddDirsUpdateFields {
  name?: string;
  directories?: string[];
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const COMPANION_DIR = join(homedir(), ".companion");
const ADD_DIRS_DIR = join(COMPANION_DIR, "add-dirs");

function ensureDir(): void {
  mkdirSync(ADD_DIRS_DIR, { recursive: true });
}

function filePath(slug: string): string {
  return join(ADD_DIRS_DIR, `${slug}.json`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export function listAddDirs(): AddDirsPreset[] {
  ensureDir();
  try {
    const files = readdirSync(ADD_DIRS_DIR).filter((f) => f.endsWith(".json"));
    const presets: AddDirsPreset[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(ADD_DIRS_DIR, file), "utf-8");
        presets.push(JSON.parse(raw));
      } catch {
        // Skip corrupt files
      }
    }
    presets.sort((a, b) => a.name.localeCompare(b.name));
    return presets;
  } catch {
    return [];
  }
}

export function getAddDirs(slug: string): AddDirsPreset | null {
  ensureDir();
  try {
    const raw = readFileSync(filePath(slug), "utf-8");
    return JSON.parse(raw) as AddDirsPreset;
  } catch {
    return null;
  }
}

export function createAddDirs(
  name: string,
  directories: string[],
): AddDirsPreset {
  if (!name || !name.trim()) throw new Error("Preset name is required");
  const slug = slugify(name.trim());
  if (!slug) throw new Error("Preset name must contain alphanumeric characters");

  if (!directories || directories.length === 0) {
    throw new Error("At least one directory is required");
  }

  ensureDir();
  if (existsSync(filePath(slug))) {
    throw new Error(`A preset with a similar name already exists ("${slug}")`);
  }

  const now = Date.now();
  const preset: AddDirsPreset = {
    name: name.trim(),
    slug,
    directories,
    createdAt: now,
    updatedAt: now,
  };

  writeFileSync(filePath(slug), JSON.stringify(preset, null, 2), "utf-8");
  return preset;
}

export function updateAddDirs(
  slug: string,
  updates: AddDirsUpdateFields,
): AddDirsPreset | null {
  ensureDir();
  const existing = getAddDirs(slug);
  if (!existing) return null;

  const newName = updates.name?.trim() || existing.name;
  const newSlug = slugify(newName);
  if (!newSlug) throw new Error("Preset name must contain alphanumeric characters");

  // If name changed, check for slug collision with a different preset
  if (newSlug !== slug && existsSync(filePath(newSlug))) {
    throw new Error(`A preset with a similar name already exists ("${newSlug}")`);
  }

  const preset: AddDirsPreset = {
    ...existing,
    name: newName,
    slug: newSlug,
    directories: updates.directories ?? existing.directories,
    updatedAt: Date.now(),
  };

  // If slug changed, delete old file
  if (newSlug !== slug) {
    try { unlinkSync(filePath(slug)); } catch { /* ok */ }
  }

  writeFileSync(filePath(newSlug), JSON.stringify(preset, null, 2), "utf-8");
  return preset;
}

export function deleteAddDirs(slug: string): boolean {
  ensureDir();
  if (!existsSync(filePath(slug))) return false;
  try {
    unlinkSync(filePath(slug));
    return true;
  } catch {
    return false;
  }
}
