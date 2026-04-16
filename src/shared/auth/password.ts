import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

export const PasswordService = {
  async hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTS);
  },

  async verify(storedHash: string, password: string): Promise<boolean> {
    return verify(storedHash, password);
  },

  needsRehash(storedHash: string): boolean {
    // Parse Argon2 hash format: $argon2id$v=19$m=<memory>,t=<time>,p=<parallelism>$...
    // Returns true if the hash was created with different parameters than current config
    const paramsMatch = storedHash.match(/\$m=(\d+),t=(\d+),p=(\d+)\$/);
    if (!paramsMatch) {
      return true; // Invalid hash format, needs rehashing
    }

    const [, memory, time, parallelism] = paramsMatch.map(Number);

    return (
      memory !== ARGON2_OPTS.memoryCost ||
      time !== ARGON2_OPTS.timeCost ||
      parallelism !== ARGON2_OPTS.parallelism
    );
  },
} as const;
