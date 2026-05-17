import type { Skill } from "@/lib/domain";

const skillTitleCollator = new Intl.Collator("zh-Hans-CN");

type SortableSkill = Pick<Skill, "category" | "sortOrder" | "title"> & Partial<Pick<Skill, "isSystem">>;

export function compareSkillsForDisplay(left: SortableSkill, right: SortableSkill) {
  const systemComparison = Number(Boolean(right.isSystem)) - Number(Boolean(left.isSystem));
  if (systemComparison !== 0) return systemComparison;

  const leftSortOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const rightSortOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftSortOrder !== rightSortOrder) return leftSortOrder - rightSortOrder;

  const categoryComparison = left.category.localeCompare(right.category);
  if (categoryComparison !== 0) return categoryComparison;

  return skillTitleCollator.compare(left.title, right.title);
}

export function orderSkillsForDisplay<T extends SortableSkill>(skills: readonly T[]) {
  return [...skills].sort(compareSkillsForDisplay);
}
