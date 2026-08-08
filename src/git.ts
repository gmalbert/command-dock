export function validateBranchName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Enter a branch name.";
  if (/\s/.test(name)) return "Branch names cannot contain spaces.";
  if (
    name.startsWith("-") ||
    name.startsWith(".") ||
    name.endsWith(".") ||
    name.endsWith("/") ||
    name.includes("..") ||
    name.includes("@{")
  ) {
    return "Enter a valid Git branch name.";
  }
  if (/[~^:?*[\\]/.test(name) || name.includes("//") || name.endsWith(".lock"))
    return "Enter a valid Git branch name.";
  return undefined;
}
