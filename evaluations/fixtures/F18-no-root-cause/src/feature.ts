export function maybeEnable(flag: boolean): boolean {
  // Behavior depends on an undocumented environment condition.
  if (process.env.FEATURE_FLAG === "on") return flag;
  return !flag;
}
