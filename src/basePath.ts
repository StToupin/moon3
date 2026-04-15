const baseUrl = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  return `${baseUrl}${path.replace(/^\/+/, "")}`;
}
