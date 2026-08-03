import { getActingClientId } from "@/lib/workspace";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Resolve URL de mídia/screenshot da API (absoluta ou relativa). */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = API_URL.replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  clientId: string | null;
  /** Presente no login quando o cliente é condomínio */
  isCondo?: boolean;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("lede_token");
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // LEDE no espaço de um cliente: API trata como contexto desse cliente
  const actingClientId = getActingClientId();
  if (actingClientId) {
    headers.set("X-Client-Context", actingClientId);
  }

  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new Error(message ?? `Erro ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type UploadResult = {
  url: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  type: "image" | "video";
  originalName: string;
};

export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  return api<UploadResult>("/uploads", { method: "POST", body: form });
}

export function setAuth(token: string, user: AuthUser) {
  localStorage.setItem("lede_token", token);
  localStorage.setItem("lede_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("lede_token");
  localStorage.removeItem("lede_user");
  localStorage.removeItem("lede_workspace");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("lede_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isLedeRole(role: string) {
  return role === "lede_admin" || role === "lede_operator";
}

/** Atualiza usuário no localStorage a partir de GET /auth/me (inclui isCondo). */
export async function refreshAuthUser(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const me = await api<{
      id: string;
      email: string;
      name: string;
      role: string;
      clientId: string | null;
      client?: { isCondo: boolean; name: string } | null;
    }>("/auth/me");
    const user: AuthUser = {
      id: me.id,
      email: me.email,
      name: me.name,
      role: me.role,
      clientId: me.clientId,
      isCondo: me.client?.isCondo ?? false,
    };
    localStorage.setItem("lede_user", JSON.stringify(user));
    return user;
  } catch {
    return getStoredUser();
  }
}
