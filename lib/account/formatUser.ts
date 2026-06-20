import type { AuthUser } from "@/lib/auth/types";

export function getUserDisplayName(user: AuthUser | null): string {
  const fullName = user?.fullName?.trim();
  if (fullName) return fullName;
  const email = user?.email?.trim();
  if (!email) return "Usuario";
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").trim() || email;
}

export function getUserInitials(user: AuthUser | null): string {
  const name = getUserDisplayName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "GT").toUpperCase();
}

export function formatOptionalBoolean(value: boolean | undefined): string | null {
  if (value === undefined) return null;
  return value ? "Verificado" : "Pendiente";
}
