export const PAGE_SIZES = [10, 25, 50];
export function paginate(items, requestedPage, requestedSize) {
  const size = PAGE_SIZES.includes(Number(requestedSize)) ? Number(requestedSize) : 10;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const parsed = Number(requestedPage);
  const page = Math.min(pages, Math.max(1, Number.isFinite(parsed) ? Math.floor(parsed) : 1));
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page, pages, size, total: items.length, from: items.length ? start + 1 : 0, to: Math.min(start + size, items.length) };
}
