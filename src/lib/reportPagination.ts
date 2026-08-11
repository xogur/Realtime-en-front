export type MeasuredCorrection = {
  id: string;
  height: number;
};

export function packMeasuredCorrections(
  measurements: MeasuredCorrection[],
  firstPageCapacity: number,
  followingPageCapacity: number,
  gap = 8,
): string[][] {
  if (measurements.length === 0) return [[]];
  const safeFirstCapacity = Math.max(0, firstPageCapacity);
  const safeFollowingCapacity = Math.max(1, followingPageCapacity);
  const pages: string[][] = [[]];
  let capacity = safeFirstCapacity;
  let used = 0;

  measurements.forEach((measurement) => {
    const height = Math.max(0, measurement.height);
    const currentPage = pages[pages.length - 1];
    const required = (currentPage.length > 0 ? gap : 0) + height;
    if (currentPage.length > 0 && used + required > capacity) {
      pages.push([measurement.id]);
      capacity = safeFollowingCapacity;
      used = height;
      return;
    }
    if (currentPage.length === 0 && height > capacity && pages.length === 1 && safeFirstCapacity < safeFollowingCapacity) {
      pages.push([measurement.id]);
      capacity = safeFollowingCapacity;
      used = height;
      return;
    }
    currentPage.push(measurement.id);
    used += required;
  });

  if (pages.length > 1 && pages[0].length === 0) pages.shift();
  if (pages.length > 1 && pages[pages.length - 1].length === 1) {
    const previous = pages[pages.length - 2];
    const last = pages[pages.length - 1];
    if (previous.length > 2) {
      const heights = new Map(measurements.map((item) => [item.id, Math.max(0, item.height)]));
      const candidate = previous[previous.length - 1];
      const balancedHeight = (heights.get(candidate) ?? 0) + gap + (heights.get(last[0]) ?? 0);
      if (balancedHeight <= safeFollowingCapacity) {
        previous.pop();
        last.unshift(candidate);
      }
    }
  }
  return pages;
}
