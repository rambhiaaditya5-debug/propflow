export function formatDate(value: string | undefined) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function formatMoney(value: number | undefined) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}
