"use client";

import type { Skill } from "@/lib/domain";

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

  function toggle(skillId: string) {
    const next = new Set(selectedSkillIds);
    if (next.has(skillId)) {
      next.delete(skillId);
    } else {
      next.add(skillId);
    }
    onChange(Array.from(next));
  }

  return (
    <div className="skill-picker">
      {effectGroups.map((group) => {
        const groupSkills = skills.filter((skill) => skill.appliesTo === group.appliesTo);
        if (groupSkills.length === 0) return null;

        return (
          <fieldset aria-label={group.title} className="skill-picker__group" key={group.appliesTo}>
            <legend>{group.title}</legend>
            {groupSkills.map((skill) => (
              <label className="skill-picker__item" key={skill.id}>
                <input
                  checked={selected.has(skill.id)}
                  disabled={disabled}
                  onChange={() => toggle(skill.id)}
                  type="checkbox"
                />
                <span>
                  <strong>{skill.title}</strong>
                  <em className="skill-effect-label">{group.effect}</em>
                  {skill.description ? <small>{skill.description}</small> : null}
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}
