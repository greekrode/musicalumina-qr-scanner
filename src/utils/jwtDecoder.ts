export interface JWTPayload {
  [key: string]: any;
}

export interface DecodedJWT {
  header: JWTPayload;
  payload: JWTPayload;
  signature: string;
  isValid: boolean;
  isSignatureValid: boolean;
  error?: string;
}

export function isJWT(token: string): boolean {
  // JWT tokens have exactly 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  // Check if each part is valid base64url
  try {
    parts.forEach(part => {
      if (!part) throw new Error('Empty part');
      // Convert base64url to base64
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      atob(padded);
    });
    return true;
  } catch {
    return false;
  }
}

// Convert string to ArrayBuffer
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

// Convert ArrayBuffer to base64url
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Verify JWT signature using HS256
async function verifyHS256Signature(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [headerPart, payloadPart, signaturePart] = parts;
    const data = `${headerPart}.${payloadPart}`;

    // Import the secret key
    const key = await crypto.subtle.importKey(
      'raw',
      stringToArrayBuffer(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Sign the data
    const signature = await crypto.subtle.sign('HMAC', key, stringToArrayBuffer(data));
    const expectedSignature = arrayBufferToBase64Url(signature);

    // Compare signatures
    return expectedSignature === signaturePart;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

export async function decodeJWT(token: string): Promise<DecodedJWT> {
  try {
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      return {
        header: {},
        payload: {},
        signature: '',
        isValid: false,
        isSignatureValid: false,
        error: 'Invalid JWT format - must have 3 parts'
      };
    }

    const [headerPart, payloadPart, signaturePart] = parts;

    // Decode header
    const header = JSON.parse(base64UrlDecode(headerPart));
    
    // Decode payload
    const payload = JSON.parse(base64UrlDecode(payloadPart));

    // Get the secret key from environment
    const secretKey = import.meta.env.VITE_JWT_PUBLIC_KEY;
    let isSignatureValid = false;

    if (secretKey) {
      // Check if the algorithm is HS256
      if (header.alg === 'HS256') {
        isSignatureValid = await verifyHS256Signature(token, secretKey);
      } else {
        console.warn(`Unsupported algorithm: ${header.alg}. Only HS256 is supported.`);
      }
    } else {
      console.warn('VITE_JWT_PUBLIC_KEY environment variable not found. Signature verification skipped.');
    }

    return {
      header,
      payload,
      signature: signaturePart,
      isValid: true,
      isSignatureValid
    };
  } catch (error) {
    return {
      header: {},
      payload: {},
      signature: '',
      isValid: false,
      isSignatureValid: false,
      error: error instanceof Error ? error.message : 'Failed to decode JWT'
    };
  }
}

function base64UrlDecode(str: string): string {
  // Convert base64url to base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  const padding = 4 - (base64.length % 4);
  if (padding !== 4) {
    base64 += '='.repeat(padding);
  }
  
  // Decode base64
  const decoded = atob(base64);
  
  // Convert to UTF-8
  return decodeURIComponent(escape(decoded));
}

export function formatJWTPayload(payload: JWTPayload): string {
  const formatted: { [key: string]: any } = {};
  
  Object.entries(payload).forEach(([key, value]) => {
    // Format common JWT claims
    switch (key) {
      case 'exp':
        formatted['Expires'] = new Date(value * 1000).toLocaleString();
        formatted['exp (raw)'] = value;
        break;
      case 'iat':
        formatted['Issued At'] = new Date(value * 1000).toLocaleString();
        formatted['iat (raw)'] = value;
        break;
      case 'nbf':
        formatted['Not Before'] = new Date(value * 1000).toLocaleString();
        formatted['nbf (raw)'] = value;
        break;
      case 'iss':
        formatted['Issuer'] = value;
        break;
      case 'sub':
        formatted['Subject'] = value;
        break;
      case 'aud':
        formatted['Audience'] = value;
        break;
      case 'jti':
        formatted['JWT ID'] = value;
        break;
      default:
        formatted[key] = value;
    }
  });
  
  return JSON.stringify(formatted, null, 2);
}