"use client";

import { SessionProvider } from "next-auth/react";
import { type ReactNode } from "react";
import { appPath } from "@/lib/web-base-path";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider basePath={appPath("/api/auth")}>{children}</SessionProvider>;
}
