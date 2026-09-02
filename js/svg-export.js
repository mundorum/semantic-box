// Figure export — turn the live canvas <svg>(s) into a downloadable vector
// (SVG) or high-resolution raster (PNG), for dropping straight into a paper.
//
// Node and edge styling in this app is entirely inline SVG presentation
// attributes (fill, stroke, stroke-width, opacity, font-family on <text>), so
// a plain clone already carries every visual. The only extra work is:
//   - a white background rect (the on-screen dot-grid is CSS, left out of the
//     figure deliberately — cleaner for print);
//   - an explicit width / height / viewBox and the SVG namespace so the file
//     opens standalone in a browser, Illustrator or Inkscape;
//   - nesting each canvas in its own <svg> viewport so pan/zoom overflow is
//     clipped to that panel (compare mode puts the two side by side, split by
//     a 1px divider — one combined image, as requested);
//   - for PNG only: inlining the two Google-hosted web fonts as base64
//     @font-face so rasterised text renders in JetBrains Mono / Figtree
//     rather than the browser's default monospace. Best-effort — any fetch
//     failure falls back silently.

const SVG_EXPORT_NS = 'http://www.w3.org/2000/svg';
const SVG_EXPORT_DIVIDER = 1;

async function serializeCanvasSVG(svgEls, width, height, opts = {}) {
  const n = svgEls.length;
  const totalW = n > 1 ? width * n + SVG_EXPORT_DIVIDER * (n - 1) : width;

  const outer = document.createElementNS(SVG_EXPORT_NS, 'svg');
  outer.setAttribute('xmlns', SVG_EXPORT_NS);
  outer.setAttribute('width', totalW);
  outer.setAttribute('height', height);
  outer.setAttribute('viewBox', '0 0 ' + totalW + ' ' + height);

  const bg = document.createElementNS(SVG_EXPORT_NS, 'rect');
  bg.setAttribute('x', 0);
  bg.setAttribute('y', 0);
  bg.setAttribute('width', totalW);
  bg.setAttribute('height', height);
  bg.setAttribute('fill', '#ffffff');
  outer.appendChild(bg);

  if (opts.embedFonts) {
    const css = await buildFontFaceCSS();
    if (css) {
      const style = document.createElementNS(SVG_EXPORT_NS, 'style');
      style.textContent = css;
      outer.appendChild(style);
    }
  }

  svgEls.forEach((el, i) => {
    const x = i * (width + SVG_EXPORT_DIVIDER);
    const inner = document.createElementNS(SVG_EXPORT_NS, 'svg');
    inner.setAttribute('x', x);
    inner.setAttribute('y', 0);
    inner.setAttribute('width', width);
    inner.setAttribute('height', height);
    inner.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    // clone the on-screen svg's content (its pan/zoom <g> and everything under it)
    Array.from(el.childNodes).forEach(child => inner.appendChild(child.cloneNode(true)));
    outer.appendChild(inner);

    if (i > 0) {
      const divider = document.createElementNS(SVG_EXPORT_NS, 'line');
      divider.setAttribute('x1', x - SVG_EXPORT_DIVIDER / 2);
      divider.setAttribute('x2', x - SVG_EXPORT_DIVIDER / 2);
      divider.setAttribute('y1', 0);
      divider.setAttribute('y2', height);
      divider.setAttribute('stroke', 'rgba(32,30,29,.16)');
      divider.setAttribute('stroke-width', SVG_EXPORT_DIVIDER);
      outer.appendChild(divider);
    }
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(outer);
}

// Draw an SVG string onto an offscreen canvas at `scale`× and hand back a PNG blob.
function rasterize(svgString, width, height, scale) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
    };
    img.onerror = () => reject(new Error('the serialised SVG failed to load for rasterisation'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
}

let _fontFaceCSSCache;
async function buildFontFaceCSS() {
  if (_fontFaceCSSCache !== undefined) return _fontFaceCSSCache;
  try {
    const link = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .find(l => /fonts\.googleapis\.com/.test(l.href));
    if (!link) { _fontFaceCSSCache = ''; return ''; }
    const cssText = await (await fetch(link.href)).text();
    const faces = [];
    const re = /@font-face\s*\{[^}]*\}/g;
    let m;
    while ((m = re.exec(cssText))) {
      const face = m[0];
      // keep only the basic-latin subset of each family — the figure text is ASCII
      if (/unicode-range/.test(face) && !/U\+0000-00FF/i.test(face)) continue;
      const url = (face.match(/url\(([^)]+?)\)\s*format\(['"]?woff2['"]?\)/) || [])[1];
      if (!url) continue;
      const clean = url.replace(/['"]/g, '');
      const buf = await (await fetch(clean)).arrayBuffer();
      faces.push(face.replace(/src:\s*[^;]+;/, "src: url('data:font/woff2;base64," + arrayBufferToBase64(buf) + "') format('woff2');"));
    }
    _fontFaceCSSCache = faces.join('\n');
  } catch (e) {
    _fontFaceCSSCache = '';
  }
  return _fontFaceCSSCache;
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
