"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { type WorkSummary } from "@/lib/domain";
import { apiPath } from "@/lib/web-base-path";

type WorksResponse = {
  works?: WorkSummary[];
  work?: WorkSummary;
  error?: string;
};

async function readJson(response: Response): Promise<WorksResponse> {
  try {
    return (await response.json()) as WorksResponse;
  } catch {
    return {};
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function WorkManagementPanel() {
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyWorkId, setBusyWorkId] = useState<string | null>(null);
  const isMutating = Boolean(busyWorkId);

  useEffect(() => {
    async function loadWorks() {
      setIsLoading(true);
      try {
        const response = await fetch(apiPath("/api/sessions?view=active"));
        const data = await readJson(response);
        if (!response.ok) {
          setMessage(data.error ?? "作品加载失败。");
          return;
        }
        setWorks(data.works ?? []);
      } catch {
        setMessage("作品加载失败。");
      } finally {
        setIsLoading(false);
      }
    }

    void loadWorks();
  }, []);

  function startRename(work: WorkSummary) {
    setMessage("");
    setEditingWorkId(work.id);
    setEditingTitle(work.title);
  }

  function cancelRename() {
    setEditingWorkId(null);
    setEditingTitle("");
    setMessage("");
  }

  async function submitRename(event: FormEvent<HTMLFormElement>, workId: string) {
    event.preventDefault();
    const title = editingTitle.trim();
    setMessage("");

    if (!title) {
      setMessage("作品标题不能为空。");
      return;
    }

    setBusyWorkId(workId);
    try {
      const response = await fetch(apiPath(`/api/sessions/${encodeURIComponent(workId)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      const data = await readJson(response);
      if (!response.ok || !data.work) {
        setMessage(data.error ?? "无法重命名作品。");
        return;
      }
      setWorks((current) => current.map((work) => (work.id === workId ? data.work! : work)));
      setEditingWorkId(null);
      setEditingTitle("");
    } catch {
      setMessage("无法重命名作品。");
    } finally {
      setBusyWorkId(null);
    }
  }

  async function archiveWork(workId: string) {
    setMessage("");
    setBusyWorkId(workId);
    try {
      const response = await fetch(apiPath(`/api/sessions/${encodeURIComponent(workId)}`), {
        method: "DELETE"
      });
      const data = await readJson(response);
      if (!response.ok) {
        setMessage(data.error ?? "无法归档作品。");
        return;
      }
      setWorks((current) => current.filter((work) => work.id !== workId));
      if (editingWorkId === workId) {
        setEditingWorkId(null);
        setEditingTitle("");
      }
    } catch {
      setMessage("无法归档作品。");
    } finally {
      setBusyWorkId(null);
    }
  }

  return (
    <main className="works-page">
      <section className="works-panel" aria-labelledby="works-title">
        <div className="works-panel__header">
          <div>
            <p>Tritree</p>
            <h1 id="works-title">我的作品</h1>
          </div>
          <div className="works-panel__actions">
            <Link className="works-link-button" href="/">
              返回创作
            </Link>
            <Link className="works-primary-link" href="/?new=1">
              新念头
            </Link>
          </div>
        </div>

        <div className="works-list-header">
          <h2>未归档作品</h2>
          <span>{isLoading ? "加载中" : `${works.length} 篇作品`}</span>
        </div>

        {message ? (
          <p className="works-alert" role="alert">
            {message}
          </p>
        ) : null}

        <div className="works-list">
          {!isLoading && !message && works.length === 0 ? (
            <p className="works-empty">还没有作品。开始一个新念头后会出现在这里。</p>
          ) : null}

          {works.map((work) => {
            const isEditing = editingWorkId === work.id;
            return (
              <article className="works-row" aria-label={work.title} key={work.id}>
                <div className="works-row__main">
                  <div>
                    <h2>{work.title}</h2>
                    <p>{work.artifactExcerpt || "暂无正文。"}</p>
                  </div>
                  <div className="works-row__meta">
                    <span>更新于 {formatDate(work.updatedAt)}</span>
                    <span>{work.currentRoundIndex === null ? "未开始分支" : `第 ${work.currentRoundIndex} 轮`}</span>
                    <span>约 {work.artifactSummaryLength} 字</span>
                  </div>
                </div>

                {isEditing ? (
                  <form className="works-rename-form" onSubmit={(event) => void submitRename(event, work.id)}>
                    <label>
                      <span>新标题</span>
                      <input
                        autoComplete="off"
                        autoFocus
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                      />
                    </label>
                    <button disabled={isMutating} type="submit">
                      保存名称
                    </button>
                    <button disabled={isMutating} type="button" onClick={cancelRename}>
                      取消
                    </button>
                  </form>
                ) : null}

                <div className="works-row__actions">
                  <Link className="works-link-button" href={`/?sessionId=${encodeURIComponent(work.id)}`}>
                    打开
                  </Link>
                  <button disabled={isMutating} type="button" onClick={() => startRename(work)}>
                    重命名
                  </button>
                  <button disabled={isMutating} type="button" onClick={() => void archiveWork(work.id)}>
                    归档
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
