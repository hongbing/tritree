import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Artifact } from "@/lib/domain";
import { PrdRenderer } from "./PrdRenderer";

function artifactFromPrdPayload(payload: { markdown: string; title: string }): Artifact {
  return {
    id: "artifact-prd-1",
    type: "prd",
    version: 1,
    payload,
    sourceArtifactIds: [],
    createdByNodeId: "node-prd-1",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z"
  };
}

describe("PrdRenderer", () => {
  it("renders markdown and section checks", () => {
    render(
      <PrdRenderer
        artifact={artifactFromPrdPayload({
          title: "登录 PRD",
          markdown: "## 背景\n登录慢。\n\n## 目标\n更快。"
        })}
        isBusy={false}
      />
    );

    expect(screen.getByRole("heading", { name: "登录 PRD" })).toBeInTheDocument();
    expect(screen.getByText("登录慢。")).toBeInTheDocument();
    expect(screen.getByText("已包含：背景")).toBeInTheDocument();
    expect(screen.getByText("缺少：风险")).toBeInTheDocument();
  });

  it("saves edited markdown payloads", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PrdRenderer
        artifact={artifactFromPrdPayload({ title: "旧", markdown: "旧内容" })}
        isBusy={false}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.clear(screen.getByRole("textbox", { name: "文档标题" }));
    await user.type(screen.getByRole("textbox", { name: "文档标题" }), "新 PRD");
    await user.clear(screen.getByRole("textbox", { name: "PRD Markdown" }));
    await user.type(screen.getByRole("textbox", { name: "PRD Markdown" }), "## 风险\n上线窗口短。");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith({
      title: "新 PRD",
      markdown: "## 风险\n上线窗口短。"
    });
    expect(screen.queryByRole("textbox", { name: "文档标题" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "PRD Markdown" })).not.toBeInTheDocument();
  });
});
