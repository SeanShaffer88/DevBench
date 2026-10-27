import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 2,
      parseInt(clean.slice(2, 4), 16) || 132,
      parseInt(clean.slice(4, 6), 16) || 199,
    ];
  }
  return [2, 132, 199];
}

function renderRgbaPng(size: number, accentHex: string): Buffer {
  const [rBase, gBase, bBase] = parseHexColor(accentHex);
  // Each scanline starts with filter byte 0
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const radius = Math.max(2, Math.round(size * 0.22));

  for (let y = 0; y < size; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;

      // Rounded-square alpha mask
      let inside = true;
      const dx = x < radius ? radius - x : x >= size - radius ? x - (size - radius - 1) : 0;
      const dy = y < radius ? radius - y : y >= size - radius ? y - (size - radius - 1) : 0;
      if (dx > 0 && dy > 0 && dx * dx + dy * dy > radius * radius) {
        inside = false;
      }

      if (!inside) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      // Subtle diagonal Fluent gradient + inner white workbench frame glyph
      const grad = (x + y) / (2 * size);
      const r = Math.min(255, Math.round(rBase * (0.75 + 0.45 * grad)));
      const g = Math.min(255, Math.round(gBase * (0.75 + 0.45 * grad)));
      const b = Math.min(255, Math.round(bBase * (0.75 + 0.45 * grad)));

      const margin = Math.max(2, Math.round(size * 0.24));
      const stroke = Math.max(1, Math.round(size * 0.1));
      const isGlyphBorder =
        x >= margin &&
        x < size - margin &&
        y >= margin &&
        y < size - margin &&
        (x < margin + stroke ||
          x >= size - margin - stroke ||
          y < margin + stroke ||
          y >= size - margin - stroke ||
          Math.abs(y - Math.floor(size / 2)) < Math.max(1, Math.floor(stroke * 0.7)));

      if (isGlyphBorder) {
        raw[px] = 255;
        raw[px + 1] = 255;
        raw[px + 2] = 255;
        raw[px + 3] = 255;
      } else {
        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
        raw[px + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function generateMultiSizeIco(accentHex = '#0284c7', sizes = [16, 32, 48, 256]): Buffer {
  const frames = sizes.map((sz) => ({ size: sz, png: renderRgbaPng(sz, accentHex) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(frames.length, 4);

  const dirSize = frames.length * 16;
  const directory = Buffer.alloc(dirSize);
  let offset = 6 + dirSize;

  frames.forEach((frame, idx) => {
    const pos = idx * 16;
    directory[pos] = frame.size >= 256 ? 0 : frame.size;
    directory[pos + 1] = frame.size >= 256 ? 0 : frame.size;
    directory[pos + 2] = 0; // Palette
    directory[pos + 3] = 0; // Reserved
    directory.writeUInt16LE(1, pos + 4); // Color planes
    directory.writeUInt16LE(32, pos + 6); // 32 bpp RGBA
    directory.writeUInt32LE(frame.png.length, pos + 8);
    directory.writeUInt32LE(offset, pos + 12);
    offset += frame.png.length;
  });

  return Buffer.concat([header, directory, ...frames.map((f) => f.png)]);
}

export function generateWin32ResourceRc(opts: {
  productName: string;
  companyName: string;
  fileDescription: string;
  version: string;
  icoFilename: string;
}): string {
  const parts = opts.version
    .split(/[^0-9]+/)
    .filter(Boolean)
    .concat(['0', '0', '0', '0'])
    .slice(0, 4);
  const commaVer = parts.join(',');
  const dotVer = parts.join('.');

  return [
    '#include <winres.h>',
    '',
    `IDI_APP_ICON ICON "${opts.icoFilename}"`,
    'CREATEPROCESS_MANIFEST_RESOURCE_ID RT_MANIFEST "DevBench.app.manifest"',
    '',
    'VS_VERSION_INFO VERSIONINFO',
    ` FILEVERSION ${commaVer}`,
    ` PRODUCTVERSION ${commaVer}`,
    ' FILEFLAGSMASK 0x3fL',
    ' FILEFLAGS 0x0L',
    ' FILEOS VOS_NT_WINDOWS32',
    ' FILETYPE VFT_APP',
    ' FILESUBTYPE 0x0L',
    'BEGIN',
    '    BLOCK "StringFileInfo"',
    '    BEGIN',
    '        BLOCK "040904b0"',
    '        BEGIN',
    `            VALUE "CompanyName", "${opts.companyName}"`,
    `            VALUE "FileDescription", "${opts.fileDescription}"`,
    `            VALUE "FileVersion", "${dotVer}"`,
    `            VALUE "ProductName", "${opts.productName}"`,
    `            VALUE "ProductVersion", "${dotVer}"`,
    '        END',
    '    END',
    '    BLOCK "VarFileInfo"',
    '    BEGIN',
    '        VALUE "Translation", 0x409, 1200',
    '    END',
    'END',
  ].join('\r\n');
}
