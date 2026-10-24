export type Mode = 'gemini' | 'demo';
export interface Meta {
  aiMode: Mode;
  datasetNotice: string;
  categories: { id: string; label: string }[];
  statuses: { id: string; label: string }[];
  localities: string[];
  maxImageBytes: number;
}
export interface Analysis {
  mode: Mode;
  category: string;
  issue_type?: string;
  description?: string;
  evidence: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'unknown' | string;
  confidence: number | null;
  needsMoreInfo: boolean;
  failed?: boolean;
  message?: string;
  modelUsed?: string;
}
export interface Ward { id: string; name: string; zone: string }
export interface WardResult {
  status: 'resolved' | 'ambiguous' | 'unresolved';
  ward?: Ward;
  locality?: string;
  candidates?: Ward[];
  message?: string;
  suggestions?: string[];
}
export interface DeptResult {
  status: string;
  department?: { id: string; name: string };
  office?: string;
  ruleId?: string;
  explanation?: string;
  message?: string;
}
export interface Duplicate {
  trackingId: string; locality: string; ward: string; status: string;
  createdAt: string; isDemo: boolean; sameLocality: boolean;
}
export interface RouteResult {
  ward: WardResult;
  department: DeptResult | null;
  duplicates: { status: string; duplicates: Duplicate[] } | null;
}
export interface Complaint {
  trackingId: string;
  category: string;
  categoryLabel: string;
  severity: string;
  locality: string;
  ward: Ward;
  department: { id: string; name: string };
  routingRule: string;
  status: string;
  description: string | null;
  hasImage: boolean;
  imageRef: string | null;
  history?: { status: string; at: string }[];
  analysisMode: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AgentEvent {
  id: number; tool: string; input: string; result: string; durationMs: number; success: boolean; at: string;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export function sessionId(): string {
  let id = localStorage.getItem('csa-session');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('csa-session', id); }
  return id;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('x-session-id', sessionId());
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError('network', 'Cannot reach the server. Check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error?.code ?? 'error', data?.error?.message ?? 'Something went wrong. Please try again.', res.status);
  }
  return data as T;
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
