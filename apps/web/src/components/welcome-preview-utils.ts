// Remplace les variables du type {user}, {user.id}, {server.membercount}, {date}, etc.
export function replacePlaceholders(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{([\w.]+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`
  );
}