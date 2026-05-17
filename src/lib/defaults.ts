import { existsSync, readFileSync } from "fs";
import path from "path";
import { z } from "zod";

import { CreationRequestOptionUpsertSchema, InspirationSchema, SkillUpsertSchema } from "@/lib/domain";

type StringEnv = Record<string, string | undefined>;

export const DEFAULTS_CONFIG_PATH_ENV = "TRITREE_DEFAULTS_CONFIG_PATH";

const ConfiguredSystemSkillSchema = SkillUpsertSchema.extend({
  id: z.string().trim().min(1),
  sortOrder: z.number().int().nonnegative().optional()
});

const ConfiguredCreationRequestOptionSchema = CreationRequestOptionUpsertSchema.extend({
  id: z.string().trim().min(1)
});

const DefaultsConfigSchema = z.object({
  systemSkills: z
    .array(ConfiguredSystemSkillSchema)
    .min(1, "systemSkills must be a non-empty array")
    .transform((skills) => skills.map((skill, index) => ({ ...skill, sortOrder: skill.sortOrder ?? index }))),
  creationRequestOptions: z.array(ConfiguredCreationRequestOptionSchema),
  inspirations: z.array(InspirationSchema)
});

export type ConfiguredCreationRequestOption = z.infer<typeof ConfiguredCreationRequestOptionSchema>;
export type ConfiguredDefaults = z.infer<typeof DefaultsConfigSchema>;
export type ConfiguredSystemSkill = ConfiguredDefaults["systemSkills"][number];

export function defaultDefaultsConfigPath(cwd = process.cwd()) {
  return path.join(cwd, ".tritree", "defaults.json");
}

export function resolveDefaultsConfigPath({
  cwd = process.cwd(),
  env = process.env
}: {
  cwd?: string;
  env?: StringEnv;
} = {}) {
  const configuredPath = env[DEFAULTS_CONFIG_PATH_ENV]?.trim();
  if (!configuredPath) return defaultDefaultsConfigPath(cwd);
  if (!path.isAbsolute(configuredPath)) {
    throw new Error(`${DEFAULTS_CONFIG_PATH_ENV} must be an absolute path.`);
  }
  return configuredPath;
}

export function loadConfiguredDefaults({
  configPath,
  cwd = process.cwd(),
  env = process.env,
  exists = existsSync,
  readFile = (filePath: string) => readFileSync(filePath, "utf8")
}: {
  configPath?: string;
  cwd?: string;
  env?: StringEnv;
  exists?: (filePath: string) => boolean;
  readFile?: (filePath: string) => string;
} = {}): ConfiguredDefaults {
  const resolvedPath = configPath ?? resolveDefaultsConfigPath({ cwd, env });
  if (!exists(resolvedPath)) {
    throw new Error(`Defaults config ${resolvedPath} was not found.`);
  }

  let rawText: string;
  try {
    rawText = readFile(resolvedPath);
  } catch (error) {
    throw new Error(`Defaults config ${resolvedPath} could not be read: ${errorMessage(error)}.`);
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Defaults config ${resolvedPath} is not valid JSON: ${errorMessage(error)}.`);
  }

  const parsed = DefaultsConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new Error(`Defaults config ${resolvedPath} is invalid: ${formatConfigIssue(parsed.error)}.`);
  }

  assertUniqueIds(resolvedPath, "systemSkills", parsed.data.systemSkills);
  assertUniqueIds(resolvedPath, "creationRequestOptions", parsed.data.creationRequestOptions);
  assertUniqueIds(resolvedPath, "inspirations", parsed.data.inspirations);

  return parsed.data;
}

function assertUniqueIds(resolvedPath: string, section: string, items: Array<{ id: string }>) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`Defaults config ${resolvedPath} is invalid: Duplicate ${section} id: ${item.id}.`);
    }
    seen.add(item.id);
  }
}

function formatConfigIssue(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "unknown validation error";
  const location = issue.path.length > 0 ? issue.path.join(".") : "root";
  return `${location}: ${issue.message}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
