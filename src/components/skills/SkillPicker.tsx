"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Skill } from "@/lib/domain";
import { orderSkillsForDisplay } from "@/lib/skills/skill-order";

const effectGroups = [
  { appliesTo: "writer", title: "草稿工作", effect: "作用：内容更新" },
  { appliesTo: "editor", title: "判断工作", effect: "作用：方向与检查" },
  { appliesTo: "both", title: "内容团队", effect: "作用：全程" }
] as const;

export function SkillPicker({
  disabled = false,
  onChange,
  selectedSkillIds,
  skills
}: {
  disabled?: boolean;
  onChange: (skillIds: string[]) => void;
  selectedSkillIds: string[];
  skills: Skill[];
}) {
  const selected = new Set(selectedSkillIds);
  const childrenByParentId = useMemo(() => {
    const groups = new Map<string, Skill[]>();
    for (const skill of skills) {
      if (!skill.parentSkillId) continue;
      const current = groups.get(skill.parentSkillId) ?? [];
      current.push(skill);
      groups.set(skill.parentSkillId, current);
    }
    return groups;
  }, [skills]);

  function toggle(skillId: string) {
    const next = new Set(selectedSkillIds);
    if (next.has(skillId)) {
      next.delete(skillId);
    } else {
      next.add(skillId);
    }
    onChange(Array.from(next));
  }

  function toggleGroup(skillIds: string[]) {
    const next = new Set(selectedSkillIds);
    const shouldSelect = skillIds.some((skillId) => !next.has(skillId));
    for (const skillId of skillIds) {
      if (shouldSelect) {
        next.add(skillId);
      } else {
        next.delete(skillId);
      }
    }
    onChange(Array.from(next));
  }

  return (
    <div className="skill-picker">
      {effectGroups.map((group) => {
        const groupSkills = orderSkillsForDisplay(skills.filter((skill) => skill.appliesTo === group.appliesTo));
        if (groupSkills.length === 0) return null;
        const topLevelGroupSkills = groupSkills.filter((skill) => !skill.parentSkillId);
        const topLevelGroupSkillIds = new Set(topLevelGroupSkills.map((skill) => skill.id));

        return (
          <fieldset aria-label={group.title} className="skill-picker__group" key={group.appliesTo}>
            <legend>{group.title}</legend>
            {topLevelGroupSkills.map((skill) => {
                const childSkills = orderSkillsForDisplay(childrenByParentId.get(skill.id) ?? []);
                if (childSkills.length === 0) {
                  return (
                    <SkillPickerItem
                      disabled={disabled}
                      effect={group.effect}
                      key={skill.id}
                      onToggle={() => toggle(skill.id)}
                      selected={selected.has(skill.id)}
                      skill={skill}
                    />
                  );
                }

                const memberSkills = [skill, ...childSkills];
                const memberIds = memberSkills.map((memberSkill) => memberSkill.id);
                const selectedCount = memberIds.filter((skillId) => selected.has(skillId)).length;
                return (
                  <fieldset aria-label={skill.title} className="skill-picker__subgroup" key={skill.id}>
                    <label className="skill-picker__item skill-picker__item--group">
                      <IndeterminateCheckbox
                        checked={selectedCount === memberIds.length}
                        disabled={disabled}
                        indeterminate={selectedCount > 0 && selectedCount < memberIds.length}
                        onChange={() => toggleGroup(memberIds)}
                      />
                      <span>
                        <strong>{skill.title}</strong>
                        <em className="skill-effect-label">技能组</em>
                        {skill.description ? <small>{skill.description}</small> : null}
                      </span>
                    </label>
                    <div aria-label={`${skill.title}子技能`} className="skill-picker__children" role="group">
                      {memberSkills.map((memberSkill) => (
                        <SkillPickerItem
                          disabled={disabled}
                          effect={memberSkill.id === skill.id ? "默认加载：整体流程" : "按需加载"}
                          key={memberSkill.id}
                          onToggle={() => toggle(memberSkill.id)}
                          selected={selected.has(memberSkill.id)}
                          skill={memberSkill}
                          title={memberSkill.id === skill.id ? "整体流程" : memberSkill.title}
                        />
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            {groupSkills
              .filter((skill) => skill.parentSkillId && !topLevelGroupSkillIds.has(skill.parentSkillId))
              .map((skill) => (
                <SkillPickerItem
                  disabled={disabled}
                  effect={group.effect}
                  key={skill.id}
                  onToggle={() => toggle(skill.id)}
                  selected={selected.has(skill.id)}
                  skill={skill}
                />
              ))}
          </fieldset>
        );
      })}
    </div>
  );
}

function SkillPickerItem({
  disabled,
  effect,
  onToggle,
  selected,
  skill,
  title = skill.title
}: {
  disabled: boolean;
  effect: string;
  onToggle: () => void;
  selected: boolean;
  skill: Skill;
  title?: string;
}) {
  return (
    <label className="skill-picker__item">
      <input
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        type="checkbox"
      />
      <span>
        <strong>{title}</strong>
        <em className="skill-effect-label">{effect}</em>
        {skill.description ? <small>{skill.description}</small> : null}
      </span>
    </label>
  );
}

function IndeterminateCheckbox({
  checked,
  disabled,
  indeterminate,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      ref={ref}
      type="checkbox"
    />
  );
}
