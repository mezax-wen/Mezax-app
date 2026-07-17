export function moveScanPage<T>(pages: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= pages.length || target < 0 || target >= pages.length) {
    return [...pages];
  }

  const reordered = [...pages];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}

export function removeScanPage<T extends { id: string }>(pages: readonly T[], id: string): T[] {
  return pages.filter((page) => page.id !== id);
}
