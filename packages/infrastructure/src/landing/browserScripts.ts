/**
 * The DOM work, as source text evaluated inside the page.
 *
 * Written as strings rather than functions because this package does not
 * compile against the DOM lib — the same reason `PuppeteerReferenceScreenshotter`
 * passes source text to `page.evaluate`.
 *
 * Doing this work in the browser rather than over the HTML string is the whole
 * technique. A real DOM gives node identity (so a placeholder can be addressed
 * and applied without parsing), and `getComputedStyle` gives resolved values —
 * which is why the entire `var(--token)` resolution problem that broke v1's
 * style detection simply does not arise here. We never have to work out that
 * `--font-display` is DM Serif Display; the browser already did.
 */

/**
 * Scrolls the page end to end so lazy images load and IntersectionObserver
 * reveals fire naturally, then returns to the top.
 *
 * Forcing reveals open comes later and is a last resort — letting them fire the
 * way a real visitor triggers them produces the state the template's author
 * intended, including any staggered transforms that have settled by then.
 */
export const AUTOSCROLL = `(async function () {
  const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
  let last = -1;
  for (let y = 0; y < 200000; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
    const height = document.body.scrollHeight;
    if (y > height) break;
    if (height === last && y > height - window.innerHeight) break;
    last = height;
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 300));
  try { await document.fonts.ready; } catch (e) { /* no font API */ }
  return document.body.scrollHeight;
})()`;

/**
 * Forces open anything still hidden by a reveal-on-scroll library.
 *
 * This is the single most likely way a cloned page comes back blank. AOS, WOW,
 * ScrollReveal and most Framer/GSAP setups paint elements at `opacity: 0` and
 * let a script raise them. Strip the scripts and every one of those elements
 * stays invisible forever — the page renders as an empty column.
 *
 * Deliberately narrow: only elements that are actually invisible AND carry text
 * or an image are touched, and the inline override is the minimum that undoes
 * the hiding. An element the designer meant to be invisible (a hidden mobile
 * menu, a print-only block) is left alone because its parent is hidden too.
 */
export const UNHIDE_REVEALS = `(function () {
  const REVEAL_ATTRS = ['data-aos', 'data-sr-id', 'data-scroll', 'data-animate', 'data-reveal', 'data-wow-delay'];
  const REVEAL_CLASSES = /(^|\\s)(aos-init|wow|sr-|reveal|fade-in|animate__|scroll-animate|js-reveal)/i;
  let forced = 0;

  const all = document.querySelectorAll('body *');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const style = getComputedStyle(el);
    const invisible =
      parseFloat(style.opacity) < 0.05 ||
      style.visibility === 'hidden' ||
      /translate|scale\\(0/.test(style.transform || '');
    if (!invisible) continue;

    // Only reveal what a reader was meant to see: some text or an image.
    const meaningful = (el.textContent || '').trim().length > 1 || el.querySelector('img, svg, picture');
    if (!meaningful) continue;

    // An element hidden because an ANCESTOR is hidden (a closed mobile menu)
    // must stay hidden — forcing it open paints a nav drawer over the page.
    let ancestorHidden = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.display === 'none' || ps.visibility === 'hidden' || parseFloat(ps.opacity) < 0.05) {
        ancestorHidden = true;
        break;
      }
    }
    if (ancestorHidden) continue;

    const looksLikeReveal =
      REVEAL_CLASSES.test(el.className && el.className.baseVal !== undefined ? '' : String(el.className || '')) ||
      REVEAL_ATTRS.some((a) => el.hasAttribute(a));

    // Anything invisible after a full scroll is treated as a stuck reveal even
    // without a recognisable marker: bespoke IntersectionObserver code is
    // common and carries no library signature at all.
    el.style.setProperty('opacity', '1', 'important');
    el.style.setProperty('visibility', 'visible', 'important');
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('animation', 'none', 'important');
    el.style.setProperty('transition', 'none', 'important');
    for (const a of REVEAL_ATTRS) el.removeAttribute(a);
    forced++;
    void looksLikeReveal;
  }
  return forced;
})()`;

/**
 * Removes everything that must not be republished: executable content, the
 * template owner's identity, trackers and overlays.
 *
 * Returns a tally so the extraction report can say what was taken out — a
 * template that lost four `<iframe>` embeds is still usable, but the seller
 * should be told rather than left to notice.
 */
export const CLEAN = `(function () {
  const removed = { scripts: 0, embeds: 0, forms: 0, trackers: 0, overlays: 0, identity: 0, handlers: 0 };

  const drop = (selector, key) => {
    const nodes = document.querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i++) { nodes[i].remove(); removed[key]++; }
  };

  drop('script, noscript', 'scripts');
  drop('iframe, object, embed, canvas', 'embeds');
  drop('link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="preload"][as="script"]', 'trackers');

  // The owner's SEO identity. Every one of these names THEIR product, and a
  // cloned page carrying them is a page telling search engines it is the
  // original. Regenerated for the new product at bind time.
  drop('title, link[rel="canonical"], script[type="application/ld+json"]', 'identity');
  const metas = document.querySelectorAll('meta');
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    const name = (m.getAttribute('property') || m.getAttribute('name') || '').toLowerCase();
    if (/^(og:|twitter:|description|keywords|author|robots)/.test(name)) { m.remove(); removed.identity++; }
  }

  // Forms are unwrapped rather than deleted: the markup inside one is often
  // ordinary layout, and removing the whole thing takes a section with it.
  const forms = document.querySelectorAll('form');
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const div = document.createElement('div');
    while (form.firstChild) div.appendChild(form.firstChild);
    for (let a = 0; a < form.attributes.length; a++) {
      const attr = form.attributes[a];
      if (attr.name === 'class' || attr.name === 'id' || attr.name === 'style') div.setAttribute(attr.name, attr.value);
    }
    form.replaceWith(div);
    removed.forms++;
  }
  drop('input, select, textarea, button[type="submit"]', 'forms');

  // Tracking pixels.
  const imgs = document.querySelectorAll('img');
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) { img.remove(); removed.trackers++; }
  }

  // Consent banners, chat widgets and sticky promos. Most die with their
  // scripts; these are the ones rendered server-side. Matched on BOTH a
  // fixed/sticky position and a recognisable name, because plenty of
  // legitimate sales-page furniture is fixed-position — a sticky buy bar, for
  // one, which must survive.
  const OVERLAY = /(cookie|consent|gdpr|chat-widget|intercom|drift|crisp|tawk|hubspot-messages|onetrust|cky-)/i;
  const all = document.querySelectorAll('body > *, body > * > *');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'sticky') continue;
    const name = String(el.className || '') + ' ' + String(el.id || '');
    if (OVERLAY.test(name)) { el.remove(); removed.overlays++; }
  }

  // Inline handlers and javascript: URLs.
  const every = document.querySelectorAll('*');
  for (let i = 0; i < every.length; i++) {
    const el = every[i];
    const attrs = Array.prototype.slice.call(el.attributes);
    for (let a = 0; a < attrs.length; a++) {
      const attr = attrs[a];
      if (/^on/i.test(attr.name)) { el.removeAttribute(attr.name); removed.handlers++; }
      else if (/^javascript:/i.test(attr.value || '')) { el.setAttribute(attr.name, '#'); removed.handlers++; }
    }
  }

  return removed;
})()`;

/**
 * Stamps every element with a stable address.
 *
 * Monotonic in document order over the cleaned tree, so an id means the same
 * node for the life of one extraction. This is what lets the annotation model
 * name a node without ever seeing or writing markup.
 */
export const STAMP = `(function () {
  const all = document.querySelectorAll('body, body *');
  for (let i = 0; i < all.length; i++) all[i].setAttribute('data-tpl', 'n' + i);
  return all.length;
})()`;

/** Shared helpers, prepended to the scripts that need them. */
const HELPERS = `
  const hex = (value) => {
    const m = /rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/.exec(value || '');
    if (!m) return null;
    const h = (n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  };
  const luminance = (value) => {
    const m = /rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/.exec(value || '');
    if (!m) return 1;
    const c = [m[1], m[2], m[3]].map((n) => {
      const s = parseInt(n, 10) / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const pathOf = (el) => {
    const parts = [];
    let node = el;
    for (let i = 0; node && i < 4; i++) {
      const cls = String(node.className || '').split(/\\s+/).filter(Boolean).slice(0, 1).join('');
      parts.unshift(node.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      node = node.parentElement;
      if (!node || node === document.body) break;
    }
    return parts.join('>');
  };
  const sectionOf = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const tag = n.tagName.toLowerCase();
      if (tag === 'section' || tag === 'header' || tag === 'footer' || tag === 'main' || tag === 'article') {
        return n.getAttribute('data-tpl');
      }
    }
    return null;
  };
  /** Text belonging to THIS element, not inherited from descendants. */
  const ownText = (el) => {
    let out = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 3) out += n.nodeValue;
    }
    return out.replace(/\\s+/g, ' ').trim();
  };
`;

/**
 * The candidate nodes offered to the annotation model.
 *
 * A node qualifies if it holds its own text, or is an image, or is a link.
 * Everything else is structure, which is not up for replacement.
 *
 * Capped, and the cap drops the least useful first — deepest and shortest.
 * A long sales page yields 200–400 candidates, which is a comfortable JSON
 * payload; a pathological page must not become an unbounded one.
 */
export const INVENTORY = `(function () {
  ${HELPERS}
  const MAX = 500;
  const out = [];
  const all = document.querySelectorAll('body *');

  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const tag = el.tagName.toLowerCase();
    const tplId = el.getAttribute('data-tpl');
    if (!tplId) continue;

    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const rect = el.getBoundingClientRect();
    const isImage = tag === 'img';
    const isLink = tag === 'a' || tag === 'button';
    const text = ownText(el);

    if (!isImage && !isLink && text.length < 2) continue;
    // A link with no text and no image is a bare icon or a skip target.
    if (isLink && text.length < 1 && !el.querySelector('img, svg')) continue;

    const node = {
      tplId: tplId,
      tag: tag,
      path: pathOf(el),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
    if (text) { node.text = text.slice(0, 300); node.chars = text.length; }
    if (isImage) {
      node.src = el.currentSrc || el.src || '';
      node.alt = el.getAttribute('alt') || '';
      node.width = Math.round(rect.width);
      node.height = Math.round(rect.height);
    }
    if (tag === 'a') node.href = el.getAttribute('href') || '';
    const section = sectionOf(el);
    if (section) node.sectionId = section;
    if (text && el.children.length > 0) node.hasInlineMarkup = true;
    out.push(node);
  }

  if (out.length <= MAX) return out;
  // Keep images and links unconditionally — they carry the commerce — then the
  // longest text nodes, which are the ones that read as content.
  const priority = out.filter((n) => n.tag === 'img' || n.tag === 'a' || n.tag === 'button');
  const rest = out.filter((n) => !(n.tag === 'img' || n.tag === 'a' || n.tag === 'button'))
                  .sort((a, b) => (b.chars || 0) - (a.chars || 0))
                  .slice(0, Math.max(0, MAX - priority.length));
  const keep = new Set(priority.concat(rest).map((n) => n.tplId));
  return out.filter((n) => keep.has(n.tplId));
})()`;

/**
 * Containers whose children repeat — benefit cards, FAQ rows, pricing tiers.
 *
 * Structural signature only: tag, class list and the tag skeleton of the
 * subtree. Text is ignored on purpose, because the whole point is that three
 * cards saying different things are the same card three times.
 *
 * `flexibleCount` is read from the container's own computed
 * `grid-template-columns`. An `auto-fit`/`auto-fill` grid reflows to any number
 * of items; a hand-tuned three-across flex row does not, and giving it five
 * breaks the design. That is a measurement, not a guess.
 */
export const DETECT_REPEATERS = `(function () {
  ${HELPERS}
  const MIN_COVERAGE = 0.7;
  const out = [];
  const containers = document.querySelectorAll('body *');

  const signature = (el) => {
    const cls = String(el.className || '').split(/\\s+/).filter(Boolean).sort().join('.');
    const skeleton = [];
    const walk = (node, depth) => {
      if (depth > 3) return;
      for (let i = 0; i < node.children.length; i++) {
        skeleton.push(depth + node.children[i].tagName.toLowerCase());
        walk(node.children[i], depth + 1);
      }
    };
    walk(el, 0);
    return el.tagName.toLowerCase() + '|' + cls + '|' + skeleton.join(',');
  };

  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const children = container.children;
    if (children.length < 2) continue;

    const counts = new Map();
    for (let c = 0; c < children.length; c++) {
      const sig = signature(children[c]);
      counts.set(sig, (counts.get(sig) || 0) + 1);
    }
    let bestSig = null;
    let bestCount = 0;
    counts.forEach((count, sig) => { if (count > bestCount) { bestCount = count; bestSig = sig; } });

    if (bestCount < 2 || bestCount / children.length < MIN_COVERAGE) continue;

    // A container whose repeating children are themselves containers of a
    // deeper repeat would be reported twice; keep the innermost, which is the
    // one whose items are the cards.
    let first = null;
    for (let c = 0; c < children.length; c++) {
      if (signature(children[c]) === bestSig) { first = children[c]; break; }
    }
    if (!first) continue;

    const style = getComputedStyle(container);
    const columns = style.gridTemplateColumns || '';
    const declared = (style.getPropertyValue('grid-template-columns') || '');
    const flexible = /auto-fit|auto-fill/.test(declared) || /auto-fit|auto-fill/.test(columns);

    out.push({
      containerTplId: container.getAttribute('data-tpl'),
      itemTplId: first.getAttribute('data-tpl'),
      itemCount: bestCount,
      flexibleCount: flexible,
      sampleText: (first.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
      depth: (function () { let d = 0; for (let n = container; n; n = n.parentElement) d++; return d; })(),
    });
  }

  // Innermost wins where one repeater's container is inside another's item.
  return out
    .sort((a, b) => b.depth - a.depth)
    .filter((r, idx, arr) => !arr.slice(0, idx).some((other) =>
      document.querySelector('[data-tpl="' + other.containerTplId + '"]')
        ?.contains(document.querySelector('[data-tpl="' + r.containerTplId + '"]'))))
    .slice(0, 12);
})()`;

/**
 * The template's measurable identity: its accent, its polarity, its sections.
 *
 * The accent is found by looking at the buy button rather than by counting
 * colours in a stylesheet. That is exact where counting is a heuristic — v1's
 * colour detector returned Tailwind's transparent literal `#0000` as the
 * template's dominant ground because it matched literal values after
 * `background:` and a token-based stylesheet has almost none.
 */
export const MEASURE = `(function () {
  ${HELPERS}
  const CHECKOUT_HOSTS = /(gumroad|stripe|lemonsqueezy|lemonsqueezy|shopify|payhip|paddle|thrivecart|sendowl|podia|teachable|ko-fi|buymeacoffee|paypal)\\./i;

  // ── the buy buttons ──
  const anchors = Array.prototype.slice.call(document.querySelectorAll('a[href]'));
  const byHref = new Map();
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#')) continue;
    byHref.set(href, (byHref.get(href) || 0) + 1);
  }

  let ctas = anchors.filter((a) => CHECKOUT_HOSTS.test(a.getAttribute('href') || ''));
  if (ctas.length === 0) {
    // No recognised processor: the most repeated off-page link on a sales page
    // is its buy button.
    let topHref = null;
    let topCount = 1;
    byHref.forEach((count, href) => {
      if (count > topCount && /^https?:/i.test(href)) { topCount = count; topHref = href; }
    });
    if (topHref) ctas = anchors.filter((a) => a.getAttribute('href') === topHref);
  }
  if (ctas.length === 0) {
    // Last resort: the largest anchor that is styled like a button.
    const styled = anchors
      .map((a) => ({ a: a, s: getComputedStyle(a), r: a.getBoundingClientRect() }))
      .filter((x) => x.s.display !== 'inline' && x.r.width > 90 && x.r.height > 28 &&
                     x.s.backgroundColor && x.s.backgroundColor !== 'rgba(0, 0, 0, 0)')
      .sort((x, y) => y.r.width * y.r.height - x.r.width * x.r.height);
    if (styled.length > 0) ctas = styled.map((x) => x.a);
  }

  const ctaIds = ctas.map((a) => a.getAttribute('data-tpl')).filter(Boolean);
  const primary = ctas[0] || null;
  const ctaStyle = primary ? getComputedStyle(primary) : null;
  const accentValue = ctaStyle ? hex(ctaStyle.backgroundColor) : null;
  const onAccentValue = ctaStyle ? hex(ctaStyle.color) : null;

  // ── :root tokens, resolved ──
  const rootStyle = getComputedStyle(document.documentElement);
  const rootTokens = {};
  for (let i = 0; i < rootStyle.length; i++) {
    const name = rootStyle[i];
    if (name.startsWith('--')) rootTokens[name] = rootStyle.getPropertyValue(name).trim();
  }
  // Which token IS the accent. Compared on resolved value, so a token defined
  // in oklch() and a computed rgb() still match.
  let accentToken = null;
  if (accentValue) {
    for (const name in rootTokens) {
      const resolved = rootTokens[name];
      if (!resolved) continue;
      const probe = document.createElement('span');
      probe.style.color = resolved;
      document.body.appendChild(probe);
      const asHex = hex(getComputedStyle(probe).color);
      probe.remove();
      if (asHex && asHex.toLowerCase() === accentValue.toLowerCase()) { accentToken = name; break; }
    }
  }

  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const isDark = luminance(bodyBg) < 0.4;

  // ── sections ──
  const sections = [];
  const blocks = document.querySelectorAll('body > *, main > *, body > * > section, section, header, footer');
  const seen = new Set();
  for (let i = 0; i < blocks.length; i++) {
    const el = blocks[i];
    const tplId = el.getAttribute('data-tpl');
    if (!tplId || seen.has(tplId)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height < 40) continue;
    seen.add(tplId);
    const style = getComputedStyle(el);
    sections.push({
      tplId: tplId,
      tag: el.tagName.toLowerCase(),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y + window.scrollY),
              width: Math.round(rect.width), height: Math.round(rect.height) },
      paddingBlock: [parseFloat(style.paddingTop) || 0, parseFloat(style.paddingBottom) || 0],
      background: hex(style.backgroundColor) || 'transparent',
    });
  }

  // ── content images that are not decoration ──
  const contentImages = [];
  const imgs = document.querySelectorAll('img');
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    const rect = img.getBoundingClientRect();
    if (rect.width < 96 && rect.height < 96) continue;
    contentImages.push({
      tplId: img.getAttribute('data-tpl'),
      sourceUrl: img.currentSrc || img.src || '',
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }

  return {
    ctaIds: ctaIds,
    ctaCount: ctaIds.length,
    accentValue: accentValue,
    onAccentValue: onAccentValue,
    accentToken: accentToken,
    isDark: isDark,
    rootTokens: rootTokens,
    sections: sections,
    contentImages: contentImages,
    title: document.title || '',
  };
})()`;

/**
 * Every stylesheet the page actually applied, in document order.
 *
 * Reading `document.styleSheets` rather than fetching `<link>` tags is what
 * makes this work on a modern build. It picks up CSS-in-JS (styled-components
 * and emotion inject `<style>` elements, which are in this list), every chunk
 * of a code-split Tailwind bundle rather than the first three, and the actual
 * cascade order. Cross-origin sheets throw on `cssRules`; their href comes back
 * for the caller to fetch through the SSRF-guarded fetcher.
 */
export const COLLECT_CSS = `(function () {
  const sheets = [];
  const opaque = [];
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    try {
      const rules = sheet.cssRules;
      if (!rules) { if (sheet.href) opaque.push(sheet.href); continue; }
      const text = [];
      for (let r = 0; r < rules.length; r++) text.push(rules[r].cssText);
      sheets.push({ href: sheet.href || null, css: text.join('\\n') });
    } catch (e) {
      if (sheet.href) opaque.push(sheet.href);
    }
  }
  return { sheets: sheets, opaque: opaque };
})()`;

/** Absolute URLs of every image the page displays. */
export const COLLECT_IMAGE_URLS = `(function () {
  const urls = new Set();
  const imgs = document.querySelectorAll('img');
  for (let i = 0; i < imgs.length; i++) {
    const src = imgs[i].currentSrc || imgs[i].src;
    if (src && !src.startsWith('data:')) urls.add(src);
  }
  const all = document.querySelectorAll('body *');
  for (let i = 0; i < all.length; i++) {
    const bg = getComputedStyle(all[i]).backgroundImage;
    if (!bg || bg === 'none') continue;
    const matches = bg.match(/url\\((["']?)([^"')]+)\\1\\)/g) || [];
    for (const m of matches) {
      const inner = /url\\((["']?)([^"')]+)\\1\\)/.exec(m);
      if (inner && inner[2] && !inner[2].startsWith('data:')) urls.add(new URL(inner[2], location.href).href);
    }
  }
  return Array.prototype.slice.call(urls);
})()`;

/**
 * Applies the placeholder map and converts repeaters, then serialises.
 *
 * Every entry whose `tplId` does not resolve is dropped and reported. That is
 * the guarantee: the annotation model returns ids, this resolves them, and an
 * id that names nothing does nothing. The model has no way to express a change
 * to the document because nothing it can say is markup.
 *
 * Takes its arguments as an injected JSON literal so the whole thing stays one
 * evaluatable expression.
 */
export function applyMapScript(payload: {
  placeholders: Array<{ tplId: string; placeholder: string; kind: string }>;
  repeaters: Array<{ key: string; containerTplId: string; itemTplId: string }>;
  optionalKeys: string[];
}): string {
  return `(function () {
  const payload = ${JSON.stringify(payload)};
  const applied = [];
  const dropped = [];
  const optional = new Set(payload.optionalKeys);

  // ── repeaters first ──
  // Before placeholders, because collapsing a repeater removes siblings that
  // would otherwise be carrying ids the map still refers to.
  for (const repeater of payload.repeaters) {
    const container = document.querySelector('[data-tpl="' + repeater.containerTplId + '"]');
    const item = document.querySelector('[data-tpl="' + repeater.itemTplId + '"]');
    if (!container || !item || item.parentElement !== container) { dropped.push(repeater.containerTplId); continue; }

    // Everything structurally like the kept item goes; anything else in the
    // container (a heading, a footnote) stays where the designer put it.
    const keepTag = item.tagName;
    const keepClass = String(item.className || '');
    const siblings = Array.prototype.slice.call(container.children);
    for (const sibling of siblings) {
      if (sibling === item) continue;
      if (sibling.tagName === keepTag && String(sibling.className || '') === keepClass) sibling.remove();
    }

    const holder = document.createElement('template');
    holder.setAttribute('data-repeat', repeater.key);
    item.replaceWith(holder);
    holder.appendChild(item);
    applied.push(repeater.containerTplId);
  }

  // ── placeholders ──
  for (const entry of payload.placeholders) {
    const el = document.querySelector('[data-tpl="' + entry.tplId + '"]');
    if (!el) { dropped.push(entry.tplId); continue; }
    const tokenText = '{{' + entry.placeholder + '}}';

    if (entry.kind === 'text' || entry.kind === 'html') {
      el.textContent = tokenText;
    } else if (entry.kind === 'src') {
      el.setAttribute('src', tokenText);
      // srcset would override src entirely, leaving the original image on the
      // page with a token sitting unused beside it.
      el.removeAttribute('srcset');
      el.removeAttribute('sizes');
      el.removeAttribute('loading');
      if (optional.has(entry.placeholder)) el.setAttribute('data-optional', entry.placeholder);
    } else if (entry.kind === 'href') {
      el.setAttribute('href', tokenText);
      el.setAttribute('rel', 'noopener nofollow');
      el.removeAttribute('target');
      el.removeAttribute('onclick');
    } else if (entry.kind === 'alt') {
      el.setAttribute('alt', tokenText);
    } else {
      dropped.push(entry.tplId);
      continue;
    }
    applied.push(entry.tplId);
  }

  return {
    html: '<!doctype html>\\n' + document.documentElement.outerHTML,
    appliedIds: applied,
    droppedIds: dropped,
  };
})()`;
}
