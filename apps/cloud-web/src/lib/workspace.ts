export type Workspace =
  | { type: "lede" }
  | {
      type: "client";
      clientId: string;
      name: string;
      isCondo: boolean;
    };

const STORAGE_KEY = "lede_workspace";
export const WORKSPACE_EVENT = "lede-workspace-change";

export function getWorkspace(): Workspace {
  if (typeof window === "undefined") return { type: "lede" };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { type: "lede" };
  try {
    const parsed = JSON.parse(raw) as Workspace;
    if (parsed?.type === "client" && parsed.clientId && parsed.name) {
      return {
        type: "client",
        clientId: parsed.clientId,
        name: parsed.name,
        isCondo: Boolean(parsed.isCondo),
      };
    }
    return { type: "lede" };
  } catch {
    return { type: "lede" };
  }
}

export function setWorkspace(workspace: Workspace) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  window.dispatchEvent(new Event(WORKSPACE_EVENT));
}

export function clearWorkspace() {
  setWorkspace({ type: "lede" });
}

export function getActingClientId(): string | null {
  const ws = getWorkspace();
  return ws.type === "client" ? ws.clientId : null;
}

/** Cliente efetivo para páginas do portal (usuário cliente ou LEDE no espaço). */
export function getPortalContext(user: {
  role: string;
  clientId: string | null;
  isCondo?: boolean;
} | null): {
  clientId: string | null;
  isCondo: boolean;
  name: string | null;
  isLedeActing: boolean;
} {
  if (!user) {
    return {
      clientId: null,
      isCondo: false,
      name: null,
      isLedeActing: false,
    };
  }
  const lede = user.role === "lede_admin" || user.role === "lede_operator";
  if (lede) {
    const ws = getWorkspace();
    if (ws.type === "client") {
      return {
        clientId: ws.clientId,
        isCondo: ws.isCondo,
        name: ws.name,
        isLedeActing: true,
      };
    }
    return {
      clientId: null,
      isCondo: false,
      name: null,
      isLedeActing: false,
    };
  }
  return {
    clientId: user.clientId,
    isCondo: Boolean(user.isCondo),
    name: null,
    isLedeActing: false,
  };
}
