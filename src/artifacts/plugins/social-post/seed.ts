export function resolveSocialPostTitle(title: string, body: string) {
  const trimmedTitle = title.trim();
  if (trimmedTitle && trimmedTitle !== "种子念头") return trimmedTitle;
  return Array.from(body.trim().split(/\s+/)[0] ?? "")
    .slice(0, 24)
    .join("") || "未命名内容";
}
