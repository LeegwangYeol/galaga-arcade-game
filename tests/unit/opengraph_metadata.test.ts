/**
 * Galaga Arcade Web Game — Milestone 26: OpenGraph Metadata & Procedural OG Banner Test Suite
 * 
 * Verifies:
 * 1. HTML head metadata parsing with zero external dependencies (Node.js runtime).
 * 2. Mandatory OpenGraph (og:*) properties, Twitter Card tags, and Canonical link.
 * 3. Exact expected values, descriptions, titles, dimensions (1200x630), and MIME types.
 * 4. Procedural banner generator output (valid RFC 2083 PNG header, 1200x630, non-zero payload).
 * 5. Adversarial and edge-case resilience (ordering, quotes, comments, duplicate tags, corrupted buffers).
 * 6. PixelBuffer rasterizer, GalagaLogoMatrix, and BannerScene composition fidelity.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PixelBuffer } from '../../src/renderer/og/PixelBuffer';
import { PngEncoder } from '../../src/renderer/og/PngEncoder';
import { GALAGA_LOGO_MATRIX } from '../../src/renderer/og/GalagaLogoMatrix';
import { BannerScene } from '../../src/renderer/og/BannerScene';
import { generateOgBannerBuffer } from '../../src/renderer/og';

// ============================================================================
// 1. Lightweight, Zero-Dependency HTML Head Parser
// ============================================================================

export interface ParsedMetaTag {
  property?: string;
  name?: string;
  content: string;
  httpEquiv?: string;
  raw: string;
}

export interface ParsedLinkTag {
  rel: string;
  href: string;
  type?: string;
  raw: string;
}

export interface ParsedHeadMetadata {
  title: string | null;
  metaTags: ParsedMetaTag[];
  linkTags: ParsedLinkTag[];
}

/**
 * Extracts and parses <head> tags without requiring DOMParser or JSDOM.
 */
export function parseHeadMetadata(html: string): ParsedHeadMetadata {
  // 1. Strip HTML comments to prevent commented-out tags from matching
  const strippedHtml = html.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Extract <head>...</head> content
  const headMatch = strippedHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) {
    throw new Error('Invalid HTML structure: <head> tag missing or malformed.');
  }
  const headContent = headMatch[1] ?? '';

  // 3. Extract <title>
  const titleMatch = headContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1]?.trim() ?? null : null;

  // 4. Tokenize and parse all <meta ...> tags
  const metaTags: ParsedMetaTag[] = [];
  const metaRegex = /<meta\s+([^>]+)>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaRegex.exec(headContent)) !== null) {
    const attrString = (match[1] ?? '').replace(/\/+$/, '');
    const attrs = parseAttributes(attrString);
    metaTags.push({
      property: attrs['property'],
      name: attrs['name'],
      content: attrs['content'] ?? '',
      httpEquiv: attrs['http-equiv'],
      raw: match[0],
    });
  }

  // 5. Tokenize and parse all <link ...> tags
  const linkTags: ParsedLinkTag[] = [];
  const linkRegex = /<link\s+([^>]+)>/gi;

  while ((match = linkRegex.exec(headContent)) !== null) {
    const attrString = (match[1] ?? '').replace(/\/+$/, '');
    const attrs = parseAttributes(attrString);
    if (attrs['rel'] && attrs['href']) {
      linkTags.push({
        rel: attrs['rel'],
        href: attrs['href'],
        type: attrs['type'],
        raw: match[0],
      });
    }
  }

  return { title, metaTags, linkTags };
}

/**
 * Attribute parser handling single/double quotes, unquoted values, and case-insensitivity.
 */
export function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = (match[1] ?? '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
}

// ============================================================================
// 2. Binary PNG Header Validator (RFC 2083 Compliance)
// ============================================================================

export interface PngValidationResult {
  valid: boolean;
  error?: string;
  width?: number;
  height?: number;
  bitDepth?: number;
  colorType?: number;
  hasIdat?: boolean;
  hasIend?: boolean;
}

export function validatePngBuffer(buf: Buffer): PngValidationResult {
  if (buf.length < 33) {
    return { valid: false, error: 'Buffer too small to contain a valid PNG header' };
  }

  // PNG 8-byte Magic Signature: [137, 80, 78, 71, 13, 10, 26, 10]
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== magic[i]) {
      return { valid: false, error: `Invalid PNG magic byte at index ${i}` };
    }
  }

  // First chunk must be IHDR
  const ihdrLength = buf.readUInt32BE(8);
  if (ihdrLength !== 13) {
    return { valid: false, error: `Invalid IHDR chunk length: expected 13, received ${ihdrLength}` };
  }

  const ihdrType = buf.subarray(12, 16).toString('ascii');
  if (ihdrType !== 'IHDR') {
    return { valid: false, error: `First chunk must be IHDR, received ${ihdrType}` };
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf.readUInt8(24);
  const colorType = buf.readUInt8(25);
  const compression = buf.readUInt8(26);
  const filter = buf.readUInt8(27);
  const interlace = buf.readUInt8(28);

  if (compression !== 0) {
    return { valid: false, error: `Unsupported compression method: ${compression}` };
  }
  if (filter !== 0) {
    return { valid: false, error: `Unsupported filter method: ${filter}` };
  }
  if (interlace !== 0 && interlace !== 1) {
    return { valid: false, error: `Unsupported interlace method: ${interlace}` };
  }

  // Scan chunks for IDAT and IEND
  let offset = 8;
  let hasIdat = false;
  let hasIend = false;

  while (offset + 8 <= buf.length) {
    const chunkLen = buf.readUInt32BE(offset);
    const chunkType = buf.subarray(offset + 4, offset + 8).toString('ascii');

    if (chunkType === 'IDAT' && chunkLen > 0) {
      hasIdat = true;
    }
    if (chunkType === 'IEND') {
      hasIend = true;
      break;
    }
    offset += 8 + chunkLen + 4; // length + type + data + crc
  }

  return {
    valid: true,
    width,
    height,
    bitDepth,
    colorType,
    hasIdat,
    hasIend,
  };
}

// ============================================================================
// 3. Test Suite Implementation
// ============================================================================

describe('Milestone 26: OpenGraph Metadata & Procedural OG Banner Test Suite', () => {
  const projectRoot = path.resolve(__dirname, '../../');
  const indexPath = path.resolve(projectRoot, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');
  const headData = parseHeadMetadata(indexHtml);

  // Helper query methods
  const getOg = (property: string): string | undefined =>
    headData.metaTags.find((m) => m.property === property)?.content;

  const getTwitter = (name: string): string | undefined =>
    headData.metaTags.find((m) => m.name === name)?.content;

  // --------------------------------------------------------------------------
  // Track 1: Document Structure & Canonical Tag
  // --------------------------------------------------------------------------
  describe('Track 1: Document Structure & Canonical Verification', () => {
    it('index.html exists and contains a non-empty <head> section', () => {
      expect(fs.existsSync(indexPath)).toBe(true);
      expect(indexHtml).toContain('<head>');
      expect(indexHtml).toContain('</head>');
    });

    it('defines an authentic arcade title matching "Galaga"', () => {
      expect(headData.title).toBeDefined();
      expect(headData.title).toMatch(/Galaga/);
      expect(headData.title).toContain('1981 Arcade Classic');
    });

    it('contains exactly one valid canonical URL pointing to the production domain', () => {
      const canonicalLinks = headData.linkTags.filter((l) => l.rel === 'canonical');
      expect(canonicalLinks.length).toBe(1);

      const canonicalUrl = canonicalLinks[0]!.href;
      expect(canonicalUrl).toBe('https://galaga-arcade-game.vercel.app/');
      expect(() => new URL(canonicalUrl)).not.toThrow();
      expect(new URL(canonicalUrl).protocol).toBe('https:');
    });

    it('ensures no required social metadata tags exist outside <head>', () => {
      const bodyContent = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
      expect(bodyContent).not.toMatch(/<meta\s+[^>]*property=["']og:/i);
      expect(bodyContent).not.toMatch(/<meta\s+[^>]*name=["']twitter:/i);
      expect(bodyContent).not.toMatch(/<link\s+[^>]*rel=["']canonical["']/i);
    });
  });

  // --------------------------------------------------------------------------
  // Track 2: OpenGraph (og:*) Metadata Contract
  // --------------------------------------------------------------------------
  describe('Track 2: OpenGraph (og:*) Metadata Contract', () => {
    it('defines og:type as "website"', () => {
      expect(getOg('og:type')).toBe('website');
    });

    it('defines og:url matching the production deployment URL', () => {
      expect(getOg('og:url')).toBe('https://galaga-arcade-game.vercel.app/');
    });

    it('defines og:site_name', () => {
      const siteName = getOg('og:site_name');
      expect(siteName).toBeDefined();
      expect(siteName).toContain('Galaga');
    });

    it('defines og:title matching the official title string', () => {
      const ogTitle = getOg('og:title');
      expect(ogTitle).toBeDefined();
      expect(ogTitle).toBe('Galaga — 1981 Arcade Classic (Ultimate Edition)');
      expect(ogTitle!.length).toBeGreaterThanOrEqual(20);
      expect(ogTitle!.length).toBeLessThanOrEqual(80);
    });

    it('defines og:description containing core gameplay features', () => {
      const ogDesc = getOg('og:description');
      expect(ogDesc).toBeDefined();
      expect(ogDesc).toContain('1981 Galaga');
      expect(ogDesc).toContain('Canvas 2D');
      expect(ogDesc).toContain('Web Audio API');
      expect(ogDesc).toContain('50 rounds');
      expect(ogDesc!.length).toBeGreaterThanOrEqual(80);
      expect(ogDesc!.length).toBeLessThanOrEqual(250);
    });

    it('defines og:image as an absolute HTTPS URL with image/png MIME type', () => {
      const ogImage = getOg('og:image');
      expect(ogImage).toBeDefined();
      expect(ogImage).toBe('https://galaga-arcade-game.vercel.app/og-image.png');
      expect(() => new URL(ogImage!)).not.toThrow();
      expect(new URL(ogImage!).protocol).toBe('https:');

      expect(getOg('og:image:type')).toBe('image/png');
    });

    it('defines og:image:width and og:image:height as exact 1200x630 dimensions', () => {
      const width = getOg('og:image:width');
      const height = getOg('og:image:height');

      expect(width).toBe('1200');
      expect(height).toBe('630');

      // Aspect ratio check: 1200 / 630 ≈ 1.905 (standard 1.91:1 social card)
      const ratio = Number(width) / Number(height);
      expect(ratio).toBeCloseTo(1.905, 2);
    });

    it('defines og:image:alt providing descriptive screen content', () => {
      const alt = getOg('og:image:alt');
      expect(alt).toBeDefined();
      expect(alt!.length).toBeGreaterThan(15);
      expect(alt).toMatch(/Galaga/i);
    });

    it('defines og:locale as en_US', () => {
      expect(getOg('og:locale')).toBe('en_US');
    });
  });

  // --------------------------------------------------------------------------
  // Track 3: Twitter / X Card Metadata Contract
  // --------------------------------------------------------------------------
  describe('Track 3: Twitter Card (twitter:*) Metadata Contract', () => {
    it('defines twitter:card as "summary_large_image"', () => {
      expect(getTwitter('twitter:card')).toBe('summary_large_image');
    });

    it('defines twitter:title consistent with og:title', () => {
      const title = getTwitter('twitter:title');
      expect(title).toBe('Galaga — 1981 Arcade Classic (Ultimate Edition)');
    });

    it('defines twitter:description matching og:description', () => {
      const desc = getTwitter('twitter:description');
      expect(desc).toBe(getOg('og:description'));
    });

    it('defines twitter:image as an absolute URL matching og:image', () => {
      const img = getTwitter('twitter:image');
      expect(img).toBe('https://galaga-arcade-game.vercel.app/og-image.png');
      expect(img).toBe(getOg('og:image'));
    });

    it('defines twitter:image:alt matching og:image:alt', () => {
      const alt = getTwitter('twitter:image:alt');
      expect(alt).toBe(getOg('og:image:alt'));
    });
  });

  // --------------------------------------------------------------------------
  // Track 4: Procedural Banner Asset Engine Output Verification
  // --------------------------------------------------------------------------
  describe('Track 4: Procedural Banner Asset Engine Output Verification', () => {
    it('procedural generator produces a valid RFC 2083 PNG buffer of 1200x630', async () => {
      let generateOgBannerFn: (() => Buffer | Uint8Array) | null = null;

      const candidatePaths = [
        path.resolve(projectRoot, 'scripts/generateOgBanner.ts'),
        path.resolve(projectRoot, 'scripts/generate-og.ts'),
        path.resolve(projectRoot, 'src/renderer/og/index.ts'),
      ];

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          const mod = await import(p);
          generateOgBannerFn = mod.generateOgBanner || mod.generateOgBannerBuffer || mod.default;
          if (generateOgBannerFn) break;
        }
      }

      const distOgPath = path.resolve(projectRoot, 'dist/og-image.png');
      let bannerBuffer: Buffer;

      if (generateOgBannerFn) {
        const result = generateOgBannerFn();
        bannerBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
      } else if (fs.existsSync(distOgPath)) {
        bannerBuffer = fs.readFileSync(distOgPath);
      } else {
        throw new Error('Neither procedural banner generator nor dist/og-image.png could be found.');
      }

      // Verify non-zero file size (> 1KB, < 2MB)
      expect(bannerBuffer.length).toBeGreaterThan(1024);
      expect(bannerBuffer.length).toBeLessThan(2 * 1024 * 1024);

      // Validate binary PNG structure
      const validation = validatePngBuffer(bannerBuffer);
      expect(validation.valid).toBe(true);
      expect(validation.width).toBe(1200);
      expect(validation.height).toBe(630);
      expect(validation.bitDepth).toBe(8);
      expect([2, 6]).toContain(validation.colorType); // RGB or RGBA
      expect(validation.hasIdat).toBe(true);
      expect(validation.hasIend).toBe(true);
    });

    it('verifies zero external network dependencies in generator source code', () => {
      const candidatePaths = [
        path.resolve(projectRoot, 'scripts/generate-og.ts'),
        path.resolve(projectRoot, 'scripts/generateOgBanner.ts'),
        path.resolve(projectRoot, 'src/renderer/og/index.ts'),
        path.resolve(projectRoot, 'src/renderer/og/BannerScene.ts'),
        path.resolve(projectRoot, 'src/renderer/og/PixelBuffer.ts'),
        path.resolve(projectRoot, 'src/renderer/og/PngEncoder.ts'),
      ];

      for (const p of candidatePaths) {
        if (!fs.existsSync(p)) continue;
        const code = fs.readFileSync(p, 'utf-8');
        expect(code).not.toMatch(/fetch\s*\(/);
        expect(code).not.toMatch(/https?:\/\//);
        expect(code).not.toMatch(/require\(['"](canvas|sharp|jimp)['"]\)/);
        expect(code).not.toMatch(/from\s+['"](canvas|sharp|jimp)['"]/);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Track 5: Adversarial Edge Cases & Parser Robustness
  // --------------------------------------------------------------------------
  describe('Track 5: Adversarial & Edge-Case Parser Robustness', () => {
    it('handles attribute ordering variations (content before property)', () => {
      const sample = '<head><meta content="Test Title" property="og:title"></head>';
      const parsed = parseHeadMetadata(sample);
      expect(parsed.metaTags[0]!.property).toBe('og:title');
      expect(parsed.metaTags[0]!.content).toBe('Test Title');
    });

    it('handles single-quoted and unquoted attributes', () => {
      const sample = `<head>
        <meta property='og:title' content='Single Quote'>
        <meta property=og:type content=website>
      </head>`;
      const parsed = parseHeadMetadata(sample);
      expect(parsed.metaTags[0]!.content).toBe('Single Quote');
      expect(parsed.metaTags[1]!.property).toBe('og:type');
      expect(parsed.metaTags[1]!.content).toBe('website');
    });

    it('ignores tags nested inside HTML comments', () => {
      const sample = `<head>
        <!-- <meta property="og:title" content="Commented Title"> -->
        <meta property="og:title" content="Real Title">
      </head>`;
      const parsed = parseHeadMetadata(sample);
      expect(parsed.metaTags.length).toBe(1);
      expect(parsed.metaTags[0]!.content).toBe('Real Title');
    });

    it('handles case-insensitivity in tag and attribute names', () => {
      const sample = '<HEAD><META PROPERTY="OG:TITLE" CONTENT="UPPERCASE"></HEAD>';
      const parsed = parseHeadMetadata(sample);
      expect(parsed.metaTags[0]!.property).toBe('OG:TITLE');
      expect(parsed.metaTags[0]!.content).toBe('UPPERCASE');
    });

    it('handles multiline formatted tags with whitespace', () => {
      const sample = `<head>
        <meta
          property="og:title"
          content="Multiline
          Value"
        />
      </head>`;
      const parsed = parseHeadMetadata(sample);
      expect(parsed.metaTags[0]!.property).toBe('og:title');
      expect(parsed.metaTags[0]!.content).toContain('Multiline');
    });

    it('PNG validator rejects corrupted or truncated buffers', () => {
      // 1. Empty buffer
      expect(validatePngBuffer(Buffer.alloc(0)).valid).toBe(false);

      // 2. Truncated header (< 33 bytes)
      expect(validatePngBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47])).valid).toBe(false);

      // 3. Corrupted magic bytes
      const corruptedMagic = Buffer.alloc(40);
      corruptedMagic.set([0x00, 0x00, 0x00, 0x00], 0);
      expect(validatePngBuffer(corruptedMagic).valid).toBe(false);

      // 4. Invalid dimensions (e.g. 800x600 instead of 1200x630)
      const wrongDimensions = Buffer.alloc(40);
      wrongDimensions.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      wrongDimensions.writeUInt32BE(13, 8);
      wrongDimensions.write('IHDR', 12, 'ascii');
      wrongDimensions.writeUInt32BE(800, 16);
      wrongDimensions.writeUInt32BE(600, 20);
      const res = validatePngBuffer(wrongDimensions);
      expect(res.valid).toBe(true);
      expect(res.width).toBe(800);
      expect(res.height).toBe(600);
    });

    it('asserts zero duplicate social metadata tags exist in production index.html', () => {
      const seenProperties = new Set<string>();
      const duplicates: string[] = [];

      for (const tag of headData.metaTags) {
        if (tag.property) {
          if (seenProperties.has(tag.property)) {
            duplicates.push(tag.property);
          }
          seenProperties.add(tag.property);
        }
      }

      expect(duplicates).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Track 6: Software Rasterizer & Composition Engine Deep Verification
  // --------------------------------------------------------------------------
  describe('Track 6: Software Rasterizer & Composition Engine Deep Verification', () => {
    it('PixelBuffer correctly bounds-checks and applies alpha blending', () => {
      const pb = new PixelBuffer(10, 10);
      expect(pb.width).toBe(10);
      expect(pb.height).toBe(10);
      expect(pb.data.length).toBe(10 * 10 * 4);

      // Base black pixel
      pb.setPixel(2, 2, 0, 0, 0, 255);
      // Half transparent white on top
      pb.setPixel(2, 2, 255, 255, 255, 128);

      const idx = (2 * 10 + 2) * 4;
      expect(pb.data[idx]).toBeGreaterThan(100);
      expect(pb.data[idx]).toBeLessThan(200);
      expect(pb.data[idx + 3]).toBe(255);

      // Out of bounds does not crash
      expect(() => pb.setPixel(-1, -1, 255, 0, 0)).not.toThrow();
      expect(() => pb.setPixel(100, 100, 255, 0, 0)).not.toThrow();
    });

    it('GalagaLogoMatrix is properly formed with valid dimensions and non-empty rows', () => {
      expect(GALAGA_LOGO_MATRIX.length).toBe(18);
      for (const row of GALAGA_LOGO_MATRIX) {
        expect(row.length).toBeGreaterThan(80);
      }
    });

    it('BannerScene populates non-zero pixel entropy across all composition quadrants', () => {
      const pb = new PixelBuffer(1200, 630);
      BannerScene.compose(pb);

      // Helper to count non-black pixels in a region
      const countActivePixels = (x0: number, y0: number, x1: number, y1: number): number => {
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const idx = (y * 1200 + x) * 4;
            const r = pb.data[idx]!;
            const g = pb.data[idx + 1]!;
            const b = pb.data[idx + 2]!;
            // Active if not identical to outer background (#030308)
            if (r > 5 || g > 5 || b > 12) {
              count++;
            }
          }
        }
        return count;
      };

      // Top logo region (y: 40..160, x: 300..900)
      const logoActive = countActivePixels(300, 40, 900, 160);
      expect(logoActive).toBeGreaterThan(2000);

      // Right tractor beam region (y: 250..550, x: 800..1050)
      const beamActive = countActivePixels(800, 250, 1050, 550);
      expect(beamActive).toBeGreaterThan(3000);

      // Left dual fighter region (y: 450..580, x: 200..400)
      const fighterActive = countActivePixels(200, 450, 400, 580);
      expect(fighterActive).toBeGreaterThan(1000);
    });

    it('PngEncoder correctly encodes PixelBuffer into binary PNG format', () => {
      const pb = new PixelBuffer(16, 16);
      pb.fillRect(0, 0, 16, 16, 255, 0, 0, 255);
      const encoded = PngEncoder.encode(pb);
      expect(Buffer.isBuffer(encoded)).toBe(true);
      expect(encoded.length).toBeGreaterThan(0);
      const validation = validatePngBuffer(encoded);
      expect(validation.valid).toBe(true);
      expect(validation.width).toBe(16);
      expect(validation.height).toBe(16);
    });

    it('generateOgBannerBuffer returns a complete PNG buffer matching RFC 2083', () => {
      const png = generateOgBannerBuffer();
      expect(Buffer.isBuffer(png)).toBe(true);
      expect(png.length).toBeGreaterThan(20000);

      const validation = validatePngBuffer(png);
      expect(validation.valid).toBe(true);
      expect(validation.width).toBe(1200);
      expect(validation.height).toBe(630);
    });
  });
});
