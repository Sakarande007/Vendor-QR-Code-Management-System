/**
 * @param {...(string|false|null|undefined)} classes
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
