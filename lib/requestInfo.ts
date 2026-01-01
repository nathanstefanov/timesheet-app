// lib/requestInfo.ts
import type { NextApiRequest } from 'next';

/**
 * Extract IP address from Next.js API request
 * Handles X-Forwarded-For header (from proxies/load balancers like Vercel)
 */
export function getIpAddress(req: NextApiRequest): string | undefined {
  // Try X-Forwarded-For header first (Vercel, nginx, etc.)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
    // The first one is typically the real client IP
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    const clientIp = ips[0]?.trim();
    if (clientIp) return clientIp;
  }

  // Try X-Real-IP header (some proxies use this)
  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp.trim();
  }

  // Fallback to socket remote address (local development)
  const socketIp = req.socket?.remoteAddress;
  if (socketIp) return socketIp;

  return undefined;
}

/**
 * Extract user agent from Next.js API request
 */
export function getUserAgent(req: NextApiRequest): string | undefined {
  const userAgent = req.headers['user-agent'];
  return typeof userAgent === 'string' ? userAgent : undefined;
}

/**
 * Extract both IP and user agent from request
 */
export function getRequestInfo(req: NextApiRequest): {
  ipAddress?: string;
  userAgent?: string;
} {
  return {
    ipAddress: getIpAddress(req),
    userAgent: getUserAgent(req),
  };
}

/**
 * For client-side: Get IP address using a public API
 * Note: This is less reliable and slower than server-side detection
 */
export async function getClientIpAddress(): Promise<string | undefined> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (err) {
    console.error('Failed to fetch client IP:', err);
    return undefined;
  }
}

/**
 * For client-side: Get user agent from browser
 */
export function getClientUserAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent : '';
}
