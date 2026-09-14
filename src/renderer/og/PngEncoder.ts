/**
 * Galaga Arcade Web Game — Milestone M26
 * Pure TypeScript RFC 2083 Compliant PNG Encoder
 * 
 * Encodes an uncompressed RGBA PixelBuffer into an authentic 8-bit RGBA PNG image
 * using Node.js built-in node:zlib for Deflate compression.
 * Zero external npm dependencies.
 */

import zlib from 'node:zlib';
import type { PixelBuffer } from './PixelBuffer';

// Precomputed 256-entry CRC-32 Lookup Table (ISO 3309 / RFC 2083 standard)
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

/**
 * Calculates CRC-32 checksum for a given byte buffer.
 */
function calcCrc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]!) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a PNG chunk with length, 4-character ASCII type, payload, and CRC-32 checksum.
 */
function createChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const chunk = new Uint8Array(4 + 4 + len + 4);
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);

  // 1. Length (4 bytes, Big-Endian)
  view.setUint32(0, len, false);

  // 2. Chunk Type (4 bytes ASCII)
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }

  // 3. Chunk Payload Data
  chunk.set(data, 8);

  // 4. CRC-32 Checksum computed over Type + Data
  const crcTarget = chunk.subarray(4, 8 + len);
  view.setUint32(8 + len, calcCrc32(crcTarget), false);

  return chunk;
}

export class PngEncoder {
  /**
   * Encodes a PixelBuffer into a valid binary PNG Buffer.
   */
  public static encode(buffer: PixelBuffer): Buffer {
    const { width, height, data } = buffer;

    // 1. PNG 8-byte Signature (RFC 2083 Section 3.1)
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // 2. IHDR Chunk (13 bytes)
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    ihdrView.setUint32(0, width, false);  // Width
    ihdrView.setUint32(4, height, false); // Height
    ihdr[8] = 8;  // Bit depth: 8 bits per channel
    ihdr[9] = 6;  // Color type: 6 (RGBA)
    ihdr[10] = 0; // Compression method: 0 (Deflate/inflate)
    ihdr[11] = 0; // Filter method: 0 (Adaptive)
    ihdr[12] = 0; // Interlace method: 0 (None)
    const ihdrChunk = createChunk('IHDR', ihdr);

    // 3. IDAT Chunk: Scanlines with Filter Byte 0 (None) prepended to each row
    const stride = width * 4;
    const rawScanlines = new Uint8Array(height * (1 + stride));
    for (let y = 0; y < height; y++) {
      const srcOffset = y * stride;
      const dstOffset = y * (1 + stride);
      rawScanlines[dstOffset] = 0; // Filter method: None
      rawScanlines.set(data.subarray(srcOffset, srcOffset + stride), dstOffset + 1);
    }

    const compressed = zlib.deflateSync(rawScanlines, { level: 6 });
    const idatChunk = createChunk('IDAT', compressed);

    // 4. IEND Chunk: 0-length terminating chunk
    const iendChunk = createChunk('IEND', new Uint8Array(0));

    // Combine signature and chunks into a single Buffer
    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  }
}
