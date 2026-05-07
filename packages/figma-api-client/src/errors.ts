export type FigmaApiErrorCode =
  | "E_FIGMA_REST_AUTH"
  | "E_FIGMA_REST_404"
  | "E_FIGMA_REST_429"
  | "E_FIGMA_REST_UNKNOWN";

export class FigmaApiError extends Error {
  readonly status: number;
  readonly code: FigmaApiErrorCode;

  constructor(args: { status: number; code: FigmaApiErrorCode; message: string }) {
    super(args.message);
    this.name = "FigmaApiError";
    this.status = args.status;
    this.code = args.code;
  }
}

export function mapStatusToCode(status: number): FigmaApiErrorCode {
  if (status === 401 || status === 403) return "E_FIGMA_REST_AUTH";
  if (status === 404) return "E_FIGMA_REST_404";
  if (status === 429) return "E_FIGMA_REST_429";
  return "E_FIGMA_REST_UNKNOWN";
}
