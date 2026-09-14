/**
 * Galaga Arcade Web Game — Milestone M26 Challenger 2 Adversarial Test Suite
 * 
 * Target: HTML Head Parser & Adversarial Social Scraper Verification
 * 
 * Adversarial Focus:
 * 1. Social Crawler Emulation: Facebook Crawler, Twitterbot, LinkedInBot, DiscordBot, Slackbot.
 * 2. Absolute HTTPS URLs: og:url, og:image, og:image:secure_url, twitter:image, twitter:url, canonical.
 * 3. HTML Syntax & Grammar: Tokenizer validation, unclosed tags, void tags, zero duplicate metadata.
 * 4. Unicode & Character Integrity: Em-dash (U+2014, 0xE2 80 94), clean quotes, no mojibake, first-1024-bytes charset.
 * 5. Strict Structural Boundaries: All meta tags strictly inside <head>, 0 in <body>.
 * 6. Generated Banner Integrity: dist/og-image.png RFC 2083 signature, 1200x630 dimensions, RGBA color type.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// HTML Tokenizer & DOM Structural Parser
// ============================================================================

interface MetaTag {
  property?: string;
  name?: string;
  content: string;
  charset?: string;
  httpEquiv?: string;
  raw: string;
  line: number;
}

interface LinkTag {
  rel: string;
  href: string;
  type?: string;
  raw: string;
  line: number;
}

interface ParsedDocument {
  rawHtml: string;
  rawBuffer: Buffer;
  headHtml: string;
  bodyHtml: string;
  title: string | null;
  metaTagsInHead: MetaTag[];
  metaTagsInBody: MetaTag[];
  linkTagsInHead: LinkTag[];
  linkTagsInBody: LinkTag[];
}

function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(attrStr)) !== null) {
    const rawKey = m[1];
    if (!rawKey) continue;
    const key = rawKey.toLowerCase();
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] ?? ''));
    attrs[key] = val;
  }
  return attrs;
}

function parseHtmlDocument(filePath: string): ParsedDocument {
  const rawBuffer = fs.readFileSync(filePath);
  const rawHtml = rawBuffer.toString('utf-8');

  // Strip comments for structural analysis
  const commentFreeHtml = rawHtml.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));

  // Extract <head> and <body>
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(commentFreeHtml);
  if (!headMatch || !headMatch[1]) {
    throw new Error('Missing <head> section in HTML');
  }
  const headHtml: string = headMatch[1];

  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(commentFreeHtml);
  if (!bodyMatch || !bodyMatch[1]) {
    throw new Error('Missing <body> section in HTML');
  }
  const bodyHtml: string = bodyMatch[1];

  // Title
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(headHtml);
  const title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : null;

  // Function to extract meta tags with line numbers
  const extractMeta = (htmlSnippet: string): MetaTag[] => {
    const metas: MetaTag[] = [];
    const metaRegex = /<meta\s+([^>]+)>/gi;
    let m: RegExpExecArray | null;
    while ((m = metaRegex.exec(htmlSnippet)) !== null) {
      const line = rawHtml.substring(0, m.index ?? 0).split('\n').length;
      const tagAttrs = (m[1] ?? '').replace(/\/+$/, '');
      const attrs = parseAttributes(tagAttrs);
      metas.push({
        property: attrs['property'],
        name: attrs['name'],
        content: attrs['content'] ?? '',
        charset: attrs['charset'],
        httpEquiv: attrs['http-equiv'],
        raw: m[0],
        line,
      });
    }
    return metas;
  };

  // Function to extract link tags with line numbers
  const extractLinks = (htmlSnippet: string): LinkTag[] => {
    const links: LinkTag[] = [];
    const linkRegex = /<link\s+([^>]+)>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(htmlSnippet)) !== null) {
      const line = rawHtml.substring(0, m.index ?? 0).split('\n').length;
      const tagAttrs = (m[1] ?? '').replace(/\/+$/, '');
      const attrs = parseAttributes(tagAttrs);
      if (attrs['rel'] && attrs['href']) {
        links.push({
          rel: attrs['rel'],
          href: attrs['href'],
          type: attrs['type'],
          raw: m[0],
          line,
        });
      }
    }
    return links;
  };

  return {
    rawHtml,
    rawBuffer,
    headHtml,
    bodyHtml,
    title,
    metaTagsInHead: extractMeta(headHtml),
    metaTagsInBody: extractMeta(bodyHtml),
    linkTagsInHead: extractLinks(headHtml),
    linkTagsInBody: extractLinks(bodyHtml),
  };
}

describe('M26 Challenger 2: Adversarial HTML Metadata & Social Crawler Verification', () => {
  const indexPath = path.resolve(__dirname, '../../index.html');
  const doc = parseHtmlDocument(indexPath);

  // Helper map for head meta tags
  const propMap = new Map<string, MetaTag>();
  const nameMap = new Map<string, MetaTag>();

  doc.metaTagsInHead.forEach(meta => {
    if (meta.property) propMap.set(meta.property.toLowerCase(), meta);
    if (meta.name) nameMap.set(meta.name.toLowerCase(), meta);
  });

  // ==========================================================================
  // Track 1: Social Crawler Emulation Suites
  // ==========================================================================

  describe('Track 1: Social Crawler Emulation Suites', () => {
    it('Facebook Crawler / Open Graph Object Debugger emulation', () => {
      // Facebook strictly requires og:url, og:type, og:title, og:image
      const ogUrl = propMap.get('og:url');
      const ogType = propMap.get('og:type');
      const ogTitle = propMap.get('og:title');
      const ogImage = propMap.get('og:image');
      const ogImageSecure = propMap.get('og:image:secure_url');
      const ogWidth = propMap.get('og:image:width');
      const ogHeight = propMap.get('og:image:height');
      const ogImageType = propMap.get('og:image:type');
      const ogLocale = propMap.get('og:locale');
      const ogSiteName = propMap.get('og:site_name');

      expect(ogUrl, 'og:url must be present').toBeDefined();
      expect(ogType, 'og:type must be present').toBeDefined();
      expect(ogTitle, 'og:title must be present').toBeDefined();
      expect(ogImage, 'og:image must be present').toBeDefined();

      expect(ogType!.content).toBe('website');
      expect(ogLocale!.content).toBe('en_US');
      expect(ogSiteName!.content).toBe('Galaga Arcade Game');

      // Facebook crawler validates image dimensions & secure URL
      expect(ogWidth!.content).toBe('1200');
      expect(ogHeight!.content).toBe('630');
      expect(ogImageType!.content).toBe('image/png');
      expect(ogImageSecure!.content).toBe(ogImage!.content);

      // Facebook aspect ratio test: 1200 / 630 = 1.9048 (1.91:1 standard)
      const ratio = Number(ogWidth!.content) / Number(ogHeight!.content);
      expect(Math.abs(ratio - (1200 / 630))).toBeLessThan(0.001);
    });

    it('Twitterbot / X Card Validator emulation', () => {
      const card = nameMap.get('twitter:card');
      const title = nameMap.get('twitter:title');
      const desc = nameMap.get('twitter:description');
      const image = nameMap.get('twitter:image');
      const imageAlt = nameMap.get('twitter:image:alt');
      const url = nameMap.get('twitter:url');

      expect(card, 'twitter:card must be present').toBeDefined();
      expect(card!.content).toBe('summary_large_image');

      expect(title, 'twitter:title must be present').toBeDefined();
      expect(title!.content.length).toBeGreaterThan(0);
      expect(title!.content.length).toBeLessThanOrEqual(70); // Twitter title character limit

      expect(desc, 'twitter:description must be present').toBeDefined();
      expect(desc!.content.length).toBeGreaterThan(0);
      expect(desc!.content.length).toBeLessThanOrEqual(200); // Twitter description limit

      expect(image, 'twitter:image must be present').toBeDefined();
      expect(image!.content).toMatch(/^https:\/\/.+\.png$/);

      expect(imageAlt, 'twitter:image:alt accessibility text must be present').toBeDefined();
      expect(imageAlt!.content.length).toBeGreaterThan(10);

      expect(url, 'twitter:url must be present').toBeDefined();
    });

    it('LinkedInBot / Post Inspector emulation', () => {
      const ogTitle = propMap.get('og:title')!;
      const ogDesc = propMap.get('og:description')!;
      const ogImage = propMap.get('og:image')!;
      const ogWidth = parseInt(propMap.get('og:image:width')!.content, 10);
      const ogHeight = parseInt(propMap.get('og:image:height')!.content, 10);

      // LinkedIn enforces minimum 1200x627 for full-width rich snippets
      expect(ogWidth).toBeGreaterThanOrEqual(1200);
      expect(ogHeight).toBeGreaterThanOrEqual(627);

      // Title & Description length bounds
      expect(ogTitle.content.length).toBeLessThanOrEqual(100);
      expect(ogDesc.content.length).toBeLessThanOrEqual(256);

      // LinkedIn requires absolute HTTPS image URL
      expect(ogImage.content.startsWith('https://')).toBe(true);
    });

    it('DiscordBot / Rich Embed & Unfurl emulation', () => {
      const themeColor = nameMap.get('theme-color');
      const ogTitle = propMap.get('og:title')!;
      const ogDesc = propMap.get('og:description')!;
      const ogImage = propMap.get('og:image')!;

      // Discord parses meta[name="theme-color"] into embed sidebar color
      expect(themeColor, 'Discord requires theme-color for embed accent').toBeDefined();
      expect(themeColor!.content).toMatch(/^#[0-9a-fA-F]{6}$/);

      // Verify valid 24-bit integer conversion
      const hexValue = parseInt(themeColor!.content.replace('#', ''), 16);
      expect(hexValue).toBe(0x030306);

      // Discord embed title must preserve unicode em-dash cleanly
      expect(ogTitle.content).toContain('—');
      expect(ogTitle.content).not.toContain('&mdash;');

      // Discord embed image requires absolute secure URL
      expect(ogImage.content.startsWith('https://')).toBe(true);
      expect(ogDesc.content.length).toBeGreaterThan(20);
    });

    it('Slackbot / Unfurl Link Preview emulation', () => {
      const ogTitle = propMap.get('og:title')!;
      const ogDesc = propMap.get('og:description')!;
      const ogImage = propMap.get('og:image')!;
      const ogWidth = propMap.get('og:image:width');
      const ogHeight = propMap.get('og:image:height');

      // Slack requires image dimensions to prevent dynamic relayout during chat stream
      expect(ogWidth, 'Slackbot requires og:image:width to prevent layout shift').toBeDefined();
      expect(ogHeight, 'Slackbot requires og:image:height to prevent layout shift').toBeDefined();
      expect(parseInt(ogWidth!.content, 10)).toBe(1200);
      expect(parseInt(ogHeight!.content, 10)).toBe(630);

      // Slack unfurl requires secure image
      expect(ogImage.content.startsWith('https://')).toBe(true);
      expect(ogTitle.content).toBe('Galaga — 1981 Arcade Classic (Ultimate Edition)');
      expect(ogDesc.content).toContain('Authentic 1981 Galaga arcade shooter');
    });
  });

  // ==========================================================================
  // Track 2: Absolute HTTPS URL Rigor & Identity Invariants
  // ==========================================================================

  describe('Track 2: Absolute HTTPS URL Rigor & Identity Invariants', () => {
    const canonicalLink = doc.linkTagsInHead.find(l => l.rel.toLowerCase() === 'canonical');

    const socialUrls = [
      { name: 'og:url', value: propMap.get('og:url')?.content },
      { name: 'og:image', value: propMap.get('og:image')?.content },
      { name: 'og:image:secure_url', value: propMap.get('og:image:secure_url')?.content },
      { name: 'twitter:image', value: nameMap.get('twitter:image')?.content },
      { name: 'twitter:url', value: nameMap.get('twitter:url')?.content },
      { name: 'canonical', value: canonicalLink?.href },
    ];

    it('asserts all 6 critical social & SEO URLs are defined', () => {
      for (const item of socialUrls) {
        expect(item.value, `${item.name} must not be undefined or empty`).toBeTruthy();
      }
    });

    it('asserts each URL is a valid absolute HTTPS URL adhering to WHATWG URL standard', () => {
      for (const item of socialUrls) {
        const val = item.value!;
        expect(val.startsWith('https://'), `${item.name} (${val}) must strictly begin with https://`).toBe(true);
        expect(val.startsWith('http://'), `${item.name} must NOT be unencrypted http://`).toBe(false);
        expect(val.startsWith('//'), `${item.name} must NOT be protocol-relative //`).toBe(false);
        expect(val.startsWith('/'), `${item.name} must NOT be relative root /`).toBe(false);
        expect(val.startsWith('./'), `${item.name} must NOT be relative ./`).toBe(false);

        // WHATWG URL parsing
        let parsedUrl: URL;
        expect(() => {
          parsedUrl = new URL(val);
        }, `${item.name} must parse cleanly as a valid WHATWG URL`).not.toThrow();

        expect(parsedUrl!.protocol).toBe('https:');
        expect(parsedUrl!.hostname).toBe('galaga-arcade-game.vercel.app');
        expect(parsedUrl!.port).toBe(''); // standard 443
        expect(parsedUrl!.search).toBe(''); // no query string
        expect(parsedUrl!.hash).toBe(''); // no fragment identifier
      }
    });

    it('asserts page canonical URL consistency (og:url === twitter:url === canonical href)', () => {
      const ogUrl = propMap.get('og:url')!.content;
      const twUrl = nameMap.get('twitter:url')!.content;
      const canUrl = canonicalLink!.href;

      expect(ogUrl).toBe('https://galaga-arcade-game.vercel.app/');
      expect(twUrl).toBe(ogUrl);
      expect(canUrl).toBe(ogUrl);
    });

    it('asserts banner asset URL consistency (og:image === og:image:secure_url === twitter:image)', () => {
      const ogImg = propMap.get('og:image')!.content;
      const ogSec = propMap.get('og:image:secure_url')!.content;
      const twImg = nameMap.get('twitter:image')!.content;

      expect(ogImg).toBe('https://galaga-arcade-game.vercel.app/og-image.png');
      expect(ogSec).toBe(ogImg);
      expect(twImg).toBe(ogImg);
    });
  });

  // ==========================================================================
  // Track 3: Lexical HTML Grammar, DOM Tree & Zero-Duplicate Metadata Invariant
  // ==========================================================================

  describe('Track 3: Lexical HTML Grammar & Zero-Duplicate Metadata Invariant', () => {
    it('asserts <!DOCTYPE html> is the first declaration in the document', () => {
      const trimmed = doc.rawHtml.trim();
      expect(trimmed.startsWith('<!DOCTYPE html>')).toBe(true);
    });

    it('asserts <html> element specifies lang="en"', () => {
      expect(doc.rawHtml).toMatch(/<html\s+[^>]*lang=["']en["'][^>]*>/i);
    });

    it('asserts exactly ONE <title> tag exists in <head> and none elsewhere', () => {
      const allTitles = doc.rawHtml.match(/<title[^>]*>/gi) ?? [];
      expect(allTitles.length).toBe(1);
      expect(doc.title).toBe('Galaga — 1981 Arcade Classic (Ultimate Edition)');
    });

    it('asserts exactly ONE <link rel="canonical"> tag exists in <head>', () => {
      const canonicals = doc.linkTagsInHead.filter(l => l.rel.toLowerCase() === 'canonical');
      expect(canonicals.length).toBe(1);
    });

    it('asserts zero duplicate meta property tags in <head>', () => {
      const propertyCounts = new Map<string, number>();
      doc.metaTagsInHead.forEach(meta => {
        if (meta.property) {
          const p = meta.property.toLowerCase();
          propertyCounts.set(p, (propertyCounts.get(p) ?? 0) + 1);
        }
      });

      for (const [prop, count] of propertyCounts.entries()) {
        expect(count, `Duplicate meta property "${prop}" found ${count} times in <head>`).toBe(1);
      }
    });

    it('asserts zero duplicate meta name tags in <head>', () => {
      const nameCounts = new Map<string, number>();
      doc.metaTagsInHead.forEach(meta => {
        if (meta.name) {
          const n = meta.name.toLowerCase();
          nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
        }
      });

      for (const [name, count] of nameCounts.entries()) {
        expect(count, `Duplicate meta name "${name}" found ${count} times in <head>`).toBe(1);
      }
    });

    it('asserts all tags in <head> are properly closed or valid void elements', () => {
      // Tags allowed in <head>: title, meta, link, style, script, base, noscript
      // Non-void elements like <title> and <style> must have matching close tags
      const openStyles = (doc.headHtml.match(/<style[^>]*>/gi) ?? []).length;
      const closeStyles = (doc.headHtml.match(/<\/style>/gi) ?? []).length;
      expect(openStyles).toBe(closeStyles);

      const openTitles = (doc.headHtml.match(/<title[^>]*>/gi) ?? []).length;
      const closeTitles = (doc.headHtml.match(/<\/title>/gi) ?? []).length;
      expect(openTitles).toBe(closeTitles);

      // Void elements: <meta ... /> and <link ... />
      // Ensure no trailing open angle brackets or unquoted attribute values
      const metaTagsRaw = doc.headHtml.match(/<meta\s+[^>]+>/gi) ?? [];
      for (const raw of metaTagsRaw) {
        expect(raw.endsWith('>')).toBe(true);
        // Ensure quotes are paired
        const doubleQuotes = (raw.match(/"/g) ?? []).length;
        expect(doubleQuotes % 2, `Unpaired double quotes in meta tag: ${raw}`).toBe(0);
      }
    });
  });

  // ==========================================================================
  // Track 4: Unicode Encoding, Em-Dash / Quotes Integrity & First-1024-Bytes Charset
  // ==========================================================================

  describe('Track 4: Unicode Encoding, Em-Dash / Quotes Integrity & Charset Invariant', () => {
    it('asserts <meta charset="UTF-8" /> declaration is within the first 1024 bytes (HTML5 spec)', () => {
      const charsetOffset = doc.rawBuffer.indexOf(Buffer.from('<meta charset="UTF-8"', 'utf-8'));
      expect(charsetOffset).toBeGreaterThan(0);
      expect(charsetOffset, 'HTML5 charset declaration must be within the first 1024 bytes').toBeLessThan(1024);
    });

    it('asserts em-dash is encoded as genuine UTF-8 bytes (0xE2 0x80 0x94) without mojibake corruption', () => {
      const emDashUtf8Bytes = Buffer.from([0xe2, 0x80, 0x94]);
      
      // The em-dash must appear in the raw buffer
      expect(doc.rawBuffer.includes(emDashUtf8Bytes)).toBe(true);

      // Mojibake patterns resulting from decoding UTF-8 as Latin-1 / Windows-1252
      const latin1Mojibake = Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0xe2, 0x80, 0x9d]); // â€”
      expect(doc.rawBuffer.includes(latin1Mojibake), 'Mojibake sequence â€” detected!').toBe(false);

      // Entity corruptions
      expect(doc.rawHtml.includes('&mdash;'), 'HTML entity &mdash; should not be used in title/meta').toBe(false);
      expect(doc.rawHtml.includes('&#8212;'), 'Numeric entity &#8212; should not be used').toBe(false);
      expect(doc.rawHtml.includes('&#x2014;'), 'Hex entity &#x2014; should not be used').toBe(false);
      expect(doc.rawHtml.includes('\\u2014'), 'Escaped unicode literal \\u2014 detected').toBe(false);
    });

    it('asserts title, og:title, and twitter:title have identical clean em-dash representation', () => {
      const title = doc.title;
      const metaTitle = nameMap.get('title')!.content;
      const ogTitle = propMap.get('og:title')!.content;
      const twTitle = nameMap.get('twitter:title')!.content;

      const expected = 'Galaga — 1981 Arcade Classic (Ultimate Edition)';
      expect(title).toBe(expected);
      expect(metaTitle).toBe(expected);
      expect(ogTitle).toBe(expected);
      expect(twTitle).toBe(expected);

      // Verify charCodeAt of em-dash position (index 7)
      expect(title!.charCodeAt(7)).toBe(0x2014);
    });

    it('asserts description strings have consistent phrasing and clean punctuation', () => {
      const metaDesc = nameMap.get('description')!.content;
      const ogDesc = propMap.get('og:description')!.content;
      const twDesc = nameMap.get('twitter:description')!.content;

      const expectedDesc = 'Authentic 1981 Galaga arcade shooter reconstructed with pure Canvas 2D and Web Audio API. 50 rounds, 5 boss raids, 11 cosmic crises, power-ups, and special moves!';
      expect(metaDesc).toBe(expectedDesc);
      expect(ogDesc).toBe(expectedDesc);
      expect(twDesc).toBe(expectedDesc);
    });

    it('asserts procedural SVG favicon Data URI is valid and uncorrupted', () => {
      const faviconLink = doc.linkTagsInHead.find(l => l.rel.toLowerCase() === 'icon');
      expect(faviconLink).toBeDefined();
      expect(faviconLink!.href.startsWith('data:image/svg+xml,')).toBe(true);

      // Decode URL component and verify well-formed SVG xml
      const svgDecoded = decodeURIComponent(faviconLink!.href.replace('data:image/svg+xml,', ''));
      expect(svgDecoded.startsWith('<svg')).toBe(true);
      expect(svgDecoded.endsWith('</svg>')).toBe(true);
      expect(svgDecoded).toContain("xmlns='http://www.w3.org/2000/svg'");
    });
  });

  // ==========================================================================
  // Track 5: Strict Head vs Body Tag Boundary Invariants
  // ==========================================================================

  describe('Track 5: Strict Head vs Body Tag Boundary Invariants', () => {
    it('asserts ALL <meta> tags in the document are in <head> and ZERO in <body>', () => {
      expect(doc.metaTagsInHead.length).toBeGreaterThan(15);
      expect(doc.metaTagsInBody.length, 'Body must contain zero <meta> tags').toBe(0);

      // Also double check raw regex on bodyHtml
      const metaInBodyMatches = doc.bodyHtml.match(/<meta\s+[^>]+>/gi);
      expect(metaInBodyMatches, 'Raw regex found <meta> tag in <body>').toBeNull();
    });

    it('asserts zero <title> tags in <body>', () => {
      const titleInBodyMatches = doc.bodyHtml.match(/<title[^>]*>/gi);
      expect(titleInBodyMatches).toBeNull();
    });

    it('asserts zero <link rel="canonical"> tags in <body>', () => {
      expect(doc.linkTagsInBody.some(l => l.rel.toLowerCase() === 'canonical')).toBe(false);
    });

    it('asserts </head> occurs strictly before <body in HTML source stream', () => {
      const headCloseIdx = doc.rawHtml.indexOf('</head>');
      const bodyOpenIdx = doc.rawHtml.indexOf('<body');
      expect(headCloseIdx).toBeGreaterThan(0);
      expect(bodyOpenIdx).toBeGreaterThan(0);
      expect(headCloseIdx).toBeLessThan(bodyOpenIdx);
    });
  });

  // ==========================================================================
  // Track 6: Generated Banner File Cross-Verification
  // ==========================================================================

  describe('Track 6: Generated Banner File Cross-Verification', () => {
    const bannerPath = path.resolve(__dirname, '../../dist/og-image.png');

    it('asserts dist/og-image.png exists on filesystem', () => {
      expect(fs.existsSync(bannerPath), 'dist/og-image.png must exist').toBe(true);
    });

    it('asserts dist/og-image.png is a valid RFC 2083 PNG file matching social dimensions', () => {
      const buffer = fs.readFileSync(bannerPath);
      expect(buffer.length).toBeGreaterThan(20000); // Expect ~50KB compressed payload
      expect(buffer.length).toBeLessThan(5 * 1024 * 1024); // Twitter 5MB image limit

      // 8-byte PNG signature: 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
      const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      for (let i = 0; i < 8; i++) {
        expect(buffer[i]).toBe(pngSignature[i]);
      }

      // IHDR chunk: offset 8 is length (13 bytes), offset 12 is 'IHDR'
      expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');

      // Width and Height in IHDR: 4 bytes each at offsets 16 and 20 (big-endian)
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      const bitDepth = buffer.readUInt8(24);
      const colorType = buffer.readUInt8(25);

      expect(width, 'PNG width must exactly equal 1200').toBe(1200);
      expect(height, 'PNG height must exactly equal 630').toBe(630);
      expect(bitDepth, 'PNG bit depth must be 8').toBe(8);
      expect(colorType, 'PNG color type must be 6 (RGBA)').toBe(6);

      // Cross-verify with HTML metadata
      const htmlWidth = parseInt(propMap.get('og:image:width')!.content, 10);
      const htmlHeight = parseInt(propMap.get('og:image:height')!.content, 10);
      expect(width).toBe(htmlWidth);
      expect(height).toBe(htmlHeight);
    });
  });
});
