export function internalImageSrcSet(
  source: string | null | undefined,
  widths: number[],
): string | undefined {
  if (!source?.startsWith("/api/images/")) return undefined;
  return widths
    .map((width) => {
      const separator = source.includes("?") ? "&" : "?";
      return `${source}${separator}w=${width} ${width}w`;
    })
    .join(", ");
}

export function internalImageUrl(
  source: string | null | undefined,
  width: number,
): string | null | undefined {
  if (!source?.startsWith("/api/images/")) return source;
  const separator = source.includes("?") ? "&" : "?";
  return `${source}${separator}w=${width}`;
}
