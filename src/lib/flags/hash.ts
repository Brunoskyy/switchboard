/**
 * MurmurHash3 (x86, 32-bit) — used to assign an evaluation context to a
 * rollout bucket.
 *
 * Requirements this has to meet:
 *  - deterministic across processes and machines, so the SDK, the server and
 *    the UI preview all agree on what a given user sees;
 *  - uniform, so a 10% rollout really is ~10% of traffic;
 *  - cheap, since it runs on every evaluation.
 *
 * A cryptographic hash would also satisfy the first two, but costs far more
 * than this needs. Murmur3 is not collision-resistant and must never be used
 * here for anything security-bearing.
 */
export function murmur3(input: string, seed = 0): number {
  const bytes = new TextEncoder().encode(input)
  const len = bytes.length
  const c1 = 0xcc9e2d51
  const c2 = 0x1b873593

  let h1 = seed >>> 0
  const blocks = len & ~3

  for (let i = 0; i < blocks; i += 4) {
    let k1 =
      bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)

    k1 = Math.imul(k1, c1)
    k1 = (k1 << 15) | (k1 >>> 17)
    k1 = Math.imul(k1, c2)

    h1 ^= k1
    h1 = (h1 << 13) | (h1 >>> 19)
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0
  }

  let k1 = 0
  switch (len & 3) {
    case 3:
      k1 ^= bytes[blocks + 2] << 16
    // falls through
    case 2:
      k1 ^= bytes[blocks + 1] << 8
    // falls through
    case 1:
      k1 ^= bytes[blocks]
      k1 = Math.imul(k1, c1)
      k1 = (k1 << 15) | (k1 >>> 17)
      k1 = Math.imul(k1, c2)
      h1 ^= k1
  }

  h1 ^= len
  h1 ^= h1 >>> 16
  h1 = Math.imul(h1, 0x85ebca6b)
  h1 ^= h1 >>> 13
  h1 = Math.imul(h1, 0xc2b2ae35)
  h1 ^= h1 >>> 16

  return h1 >>> 0
}

/** Maps an identity to a stable bucket in [0, 100). */
export function bucketFor(seed: string, flagKey: string, identity: string): number {
  return murmur3(`${seed}:${flagKey}:${identity}`) % 100
}
