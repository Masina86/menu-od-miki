export function toJSON<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_, nestedValue) =>
      typeof nestedValue === "bigint" ? Number(nestedValue) : nestedValue,
    ),
  ) as T;
}
