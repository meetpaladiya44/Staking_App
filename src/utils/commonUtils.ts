export function truncateAddress(address: string): string {
  if (!address || !address.startsWith("0x")) {
    return "";
  }

  const start = address.substring(0, 4);
  const end = address.substring(address.length - 4);

  return `${start}...${end}`;
}
