// Format a bigint value to a human-readable string with specified decimals
export function formatBigInt(value: bigint, decimals: number = 18, displayDecimals: number = 4): string {
    if (value === BigInt(0)) return '0';
    
    const divisor = BigInt(10) ** BigInt(decimals);
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;
    
    // Convert fractional part to string and pad with leading zeros
    let fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    
    // Trim to the desired number of display decimals
    fractionalStr = fractionalStr.substring(0, displayDecimals);
    
    // Trim trailing zeros
    fractionalStr = fractionalStr.replace(/0+$/, '');
    
    return fractionalStr.length > 0 
      ? `${integerPart}.${fractionalStr}` 
      : integerPart.toString();
  }
  
  // Convert a string to a bigint with the specified number of decimals
  export function stringToBigInt(value: string, decimals: number = 18): bigint {
    if (!value || value === '') return BigInt(0);
    
    const parts = value.split('.');
    const wholePart = parts[0];
    let fractionalPart = parts.length > 1 ? parts[1] : '';
    
    // Pad or truncate fractional part to match decimals
    if (fractionalPart.length > decimals) {
      fractionalPart = fractionalPart.substring(0, decimals);
    } else {
      fractionalPart = fractionalPart.padEnd(decimals, '0');
    }
    
    // Combine whole and fractional parts
    const combined = wholePart + fractionalPart;
    
    // Remove leading zeros to avoid parsing errors
    const trimmed = combined.replace(/^0+/, '') || '0';
    
    return BigInt(trimmed);
  }
  
  // Format a timestamp to a readable date
  export function formatTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }
  
  // Format a timestamp to show time remaining until a specific date
  export function formatTimeRemaining(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = timestamp - now;
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (24 * 60 * 60));
    const hours = Math.floor((diff % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((diff % (60 * 60)) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h remaining`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  } 