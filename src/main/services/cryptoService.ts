import crypto from 'crypto';

export class CryptoService {
  /**
   * Hashes a password using Node crypto.scrypt with a random 16-byte cryptographically secure salt.
   */
  public static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024,
    }).toString('hex');
    return `scrypt$16384$8$1$${salt}$${hash}`;
  }

  /**
   * Verifies a password against the stored scrypt hash using timing-safe comparison.
   */
  public static verifyPassword(password: string, storedHash: string): boolean {
    try {
      const parts = storedHash.split('$');
      if (parts.length !== 6 || parts[0] !== 'scrypt') {
        return false;
      }
      const cost = parseInt(parts[1], 10);
      const blockSize = parseInt(parts[2], 10);
      const parallel = parseInt(parts[3], 10);
      const salt = parts[4];
      const originalHashHex = parts[5];

      const computedHash = crypto.scryptSync(password, salt, 64, {
        N: cost,
        r: blockSize,
        p: parallel,
        maxmem: 32 * 1024 * 1024,
      });

      const originalHash = Buffer.from(originalHashHex, 'hex');
      if (computedHash.length !== originalHash.length) {
        return false;
      }

      return crypto.timingSafeEqual(computedHash, originalHash);
    } catch {
      return false;
    }
  }

  /**
   * Validates password strength policy:
   * - Minimum 8 characters
   * - At least one letter
   * - At least one digit or special character
   */
  public static validatePasswordStrength(password: string): { valid: boolean; message?: string } {
    if (!password || password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long.' };
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigitOrSpecial = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    if (!hasLetter || !hasDigitOrSpecial) {
      return {
        valid: false,
        message: 'Password must include at least one letter and at least one number or special character.',
      };
    }

    return { valid: true };
  }

  /**
   * Generates a cryptographically random session token (64 hex characters).
   */
  public static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

