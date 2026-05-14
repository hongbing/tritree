import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { SkillUpsertSchema } from "@/lib/domain";

type StringEnv = Record<string, string | undefined>;

export const SYSTEM_SKILLS_CONFIG_PATH_ENV = "TRITREE_SYSTEM_SKILLS_CONFIG_PATH";

const ConfiguredSystemSkillSchema = SkillUpsertSchema.extend({
  id: z.string().trim().min(1)
});

const SystemSkillsConfigSchema = z.object({
  systemSkills: z.preprocess(
    (value) => (value === undefined ? [] : value),
    z.array(ConfiguredSystemSkillSchema).min(1, "systemSkills must be a non-empty array")
  )
});

export type ConfiguredSystemSkill = z.infer<typeof ConfiguredSystemSkillSchema>;

export function defaultSystemSkillsConfigPath(cwd = process.cwd()) {
  return path.join(cwd, ".tritree", "system-skills.json");
}

export function resolveSystemSkillsConfigPath({
  cwd = process.cwd(),
  env = process.env
}: {
  cwd?: string;
  env?: StringEnv;
} = {}) {
  const configuredPath = env[SYSTEM_SKILLS_CONFIG_PATH_ENV]?.trim();
  if (!configuredPath) return defaultSystemSkillsConfigPath(cwd);
  if (!path.isAbsolute(configuredPath)) {
    throw new Error(`${SYSTEM_SKILLS_CONFIG_PATH_ENV} must be an absolute path.`);
  }
  return configuredPath;
}

export function loadConfiguredSystemSkills({
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
} = {}): ConfiguredSystemSkill[] {
  const resolvedPath = configPath ?? resolveSystemSkillsConfigPath({ cwd, env });
  if (!exists(resolvedPath)) {
    throw new Error(`System skills config ${resolvedPath} was not found.`);
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(readFile(resolvedPath));
  } catch (error) {
    throw new Error(`System skills config ${resolvedPath} is not valid JSON: ${errorMessage(error)}.`);
  }

  const parsed = SystemSkillsConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new Error(`System skills config ${resolvedPath} is invalid: ${formatConfigIssue(parsed.error)}.`);
  }

  const seen = new Set<string>();
  for (const skill of parsed.data.systemSkills) {
    if (seen.has(skill.id)) {
      throw new Error(`Duplicate system skill id: ${skill.id}.`);
    }
    seen.add(skill.id);
  }

  return parsed.data.systemSkills;
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
