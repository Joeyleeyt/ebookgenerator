import { describe, it, expect } from 'vitest';
import { HttpReferencePageFetcher, digest } from './HttpReferencePageFetcher.js';

function htmlResponse(body: string, headers: Record<string, string> = {}): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8', ...headers }),
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: new TextEncoder().encode(body) };
          },
          async cancel() {},
        };
      },
    },
  } as unknown as Response;
}

describe('HttpReferencePageFetcher — SSRF guard', () => {
  // The template URL is typed by a user and fetched from inside the worker's
  // network. Without these checks it is a request-forgery sink.
  const blocked = [
    'http://127.0.0.1/admin',
    'http://localhost:3000/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.4.4/',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata
    'http://100.64.0.1/', // CGNAT
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/', // v4-mapped loopback
  ];

  it.each(blocked)('refuses %s', async (url) => {
    let called = false;
    const fetcher = new HttpReferencePageFetcher(
      (async () => {
        called = true;
        return htmlResponse('<html></html>');
      }) as unknown as typeof fetch,
    );

    const result = await fetcher.fetch(url);

    expect(result.isFail()).toBe(true);
    expect(called).toBe(false); // refused before any request left the process
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com'])(
    'refuses the %s scheme',
    async (url) => {
      const result = await new HttpReferencePageFetcher((async () => htmlResponse('')) as unknown as typeof fetch).fetch(url);
      expect(result.isFail()).toBe(true);
    },
  );

  it('re-checks the destination of every redirect', async () => {
    // A public URL that redirects inward is the classic bypass.
    const impl = (async (url: string) => {
      if (String(url).includes('start')) {
        return {
          ok: false,
          status: 302,
          headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data/' }),
        } as unknown as Response;
      }
      return htmlResponse('<html><body>secrets</body></html>');
    }) as unknown as typeof fetch;

    const result = await new HttpReferencePageFetcher(impl).fetch('https://example.com/start');

    expect(result.isFail()).toBe(true);
    expect((result as { error: string }).error).toContain('private address');
  });

  it('refuses a body that is too large to be a web page', async () => {
    const impl = (async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html', 'content-length': '99000000' }),
        body: null,
      }) as unknown as Response) as unknown as typeof fetch;

    const result = await new HttpReferencePageFetcher(impl).fetch('https://example.com/');
    expect(result.isFail()).toBe(true);
    expect((result as { error: string }).error).toContain('too large');
  });

  it('refuses a response that is not HTML', async () => {
    const impl = (async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        body: null,
      }) as unknown as Response) as unknown as typeof fetch;

    const result = await new HttpReferencePageFetcher(impl).fetch('https://example.com/');
    expect(result.isFail()).toBe(true);
  });
});

describe('digest', () => {
  const page = `<!doctype html><html><head><title>The Amish Home Savings Manual</title>
    <style>
      body { font-family: Georgia, serif; background: #faf7f0; max-width: 720px; }
      .band { background: #1a1a1a; }
      .cta { background: #b8860b; color: #fff; }
      .btn { background: #b8860b; }
    </style></head>
    <body>
      <h1>Cut your household bills</h1>
      <h2>I. The Manual</h2>
      <h2>II. The Math</h2>
      <h2>III. What's Inside</h2>
      <p>Ninety-three methods, tested over generations.</p>
      <img src="a.jpg"><script>tracking()</script>
    </body></html>`;

  it('reads the heading skeleton in document order', () => {
    const d = digest('https://example.com/', page);
    expect(d.title).toBe('The Amish Home Savings Manual');
    expect(d.headings.map((h) => h.text)).toEqual([
      'Cut your household bills',
      'I. The Manual',
      'II. The Math',
      "III. What's Inside",
    ]);
  });

  it('detects the reference page’s visual treatment', () => {
    const d = digest('https://example.com/', page);
    expect(d.style.serifHeadings).toBe(true);
    expect(d.style.numberedSections).toBe(true); // roman numerals lead the headings
    expect(d.style.accent).toBe('#b8860b'); // the repeated saturated colour
    expect(d.style.grounds).toContain('#faf7f0');
    expect(d.style.measurePx).toBe(720);
  });

  it('keeps script and style content out of the readable text', () => {
    const d = digest('https://example.com/', page);
    expect(d.text).toContain('Ninety-three methods');
    expect(d.text).not.toContain('tracking()');
    expect(d.text).not.toContain('font-family');
  });

  it('reports an unnumbered, sans-serif page as such', () => {
    const d = digest(
      'https://example.com/',
      `<html><head><style>body{font-family:Inter,sans-serif}</style></head>
       <body><h2>Why it works</h2><h2>Pricing</h2><p>hello</p></body></html>`,
    );
    expect(d.style.serifHeadings).toBe(false);
    expect(d.style.numberedSections).toBe(false);
    expect(d.style.accent).toBeNull();
  });
});
