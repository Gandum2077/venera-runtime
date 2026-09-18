const UUID_GREGORIAN_OFFSET_MS = 12_219_292_800_000n;
const uuidNode = Uint8Array.from({ length: 6 }, () =>
  Math.floor(Math.random() * 256),
);
uuidNode[0] = uuidNode[0]! | 0x01;
let uuidClockSequence = Math.floor(Math.random() * 0x4000);
let lastUuidTimestampMs = -1;
let uuidTicksWithinMs = 0;

function uuidHex(value: number | bigint, width: number): string {
  return value.toString(16).padStart(width, "0");
}

/** Create the time-based UUID v1 exposed by Venera's configuration runtime. */
export function createUuid(): string {
  const wallClockMs = Date.now();
  let timestampMs = wallClockMs;

  if (wallClockMs > lastUuidTimestampMs) {
    uuidTicksWithinMs = 0;
  } else if (uuidTicksWithinMs < 9_999) {
    timestampMs = lastUuidTimestampMs;
    uuidTicksWithinMs += 1;
  } else {
    timestampMs = lastUuidTimestampMs + 1;
    uuidTicksWithinMs = 0;
  }
  if (wallClockMs < lastUuidTimestampMs) {
    uuidClockSequence = (uuidClockSequence + 1) & 0x3fff;
  }
  lastUuidTimestampMs = timestampMs;

  const timestamp =
    (BigInt(timestampMs) + UUID_GREGORIAN_OFFSET_MS) * 10_000n +
    BigInt(uuidTicksWithinMs);
  const timeLow = timestamp & 0xffffffffn;
  const timeMid = (timestamp >> 32n) & 0xffffn;
  const timeHighAndVersion = ((timestamp >> 48n) & 0x0fffn) | 0x1000n;
  const clockSequenceHigh = ((uuidClockSequence >> 8) & 0x3f) | 0x80;
  const clockSequenceLow = uuidClockSequence & 0xff;
  const node = Array.from(uuidNode, (byte) => uuidHex(byte, 2)).join("");

  return `${uuidHex(timeLow, 8)}-${uuidHex(timeMid, 4)}-${uuidHex(
    timeHighAndVersion,
    4,
  )}-${uuidHex(clockSequenceHigh, 2)}${uuidHex(clockSequenceLow, 2)}-${node}`;
}
