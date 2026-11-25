export interface CallSummary {
  text: string;
  more: boolean;
}
export interface ResultSummary {
  status: "ok" | "error";
  label: string;
  notes: string[];
  detail?: string;
}
export interface PathPort {
  shorten(value: unknown, cwd?: string): string;
}
export interface TerminalPort {
  sanitize(text: string): string;
}
export interface TextTools {
  clipPreview(text: string): string;
  firstLine(text: string): string;
  clipEnd(value: unknown, max: number): string;
  compressLine(value: unknown, max?: number): string;
  quoteValue(value: string): string;
}
export interface DomainDeps {
  paths: PathPort;
  text: TextTools;
}
