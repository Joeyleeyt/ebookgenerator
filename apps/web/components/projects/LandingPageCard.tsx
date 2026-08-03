'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Eye, Loader2, RotateCcw, Rocket, Store } from 'lucide-react';
import { Card } from '../ui/card.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';

type State = 'GENERATING' | 'DRAFT' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

interface Payload {
  settings: {
    enabled: boolean;
    checkoutUrl: string;
    priceCents: number | null;
    currency: string;
  };
  page: { state: State; url: string | null; error: string | null; hasDraft: boolean } | null;
  canPublish: boolean;
  publisherConfigured: boolean;
}

const BUSY_STATES: State[] = ['GENERATING', 'PUBLISHING'];

function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  return Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** "47" / "47.50" → cents; null when it isn't a clean price. */
function parsePrice(value: string): number | null {
  const trimmed = value.trim().replace(/^[$€£]/, '');
  if (!trimmed) return null;
  return /^\d+(\.\d{1,2})?$/.test(trimmed) ? Math.round(Number(trimmed) * 100) : null;
}

/**
 * The sales page panel on a finished project: edit the price and checkout link,
 * preview the draft, then publish. Generation and publishing are deliberately
 * two actions — nothing reaches a public URL that the user hasn't looked at.
 */
export function LandingPageCard({ projectId, projectCompleted }: { projectId: string; projectCompleted: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { keepEdits?: boolean }) => {
      const res = await fetch(`/api/projects/${projectId}/landing-page`);
      if (!res.ok) return;
      const payload = (await res.json()) as Payload;
      setData(payload);
      // Don't clobber what the user is mid-way through typing.
      if (!opts?.keepEdits) {
        setCheckoutUrl(payload.settings.checkoutUrl);
        setPrice(centsToInput(payload.settings.priceCents));
      }
    },
    [projectId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The work runs on a queue, so poll while it's in flight.
  const state = data?.page?.state ?? null;
  useEffect(() => {
    if (!state || !BUSY_STATES.includes(state)) return;
    const t = setInterval(() => void load({ keepEdits: true }), 3000);
    return () => clearInterval(t);
  }, [state, load]);

  if (!data?.settings.enabled) return null;

  const page = data.page;
  const working = busy || (state !== null && BUSY_STATES.includes(state));

  async function save(): Promise<boolean> {
    const cents = parsePrice(price);
    if (price.trim() && cents === null) {
      setProblem('Enter the price as a number, e.g. 47 or 47.00.');
      return false;
    }
    const res = await fetch(`/api/projects/${projectId}/landing-page`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        landingCheckoutUrl: checkoutUrl.trim(),
        ...(cents !== null ? { landingPriceCents: cents } : {}),
      }),
    });
    if (!res.ok) {
      setProblem((await res.json()).error ?? 'Could not save');
      return false;
    }
    setProblem(null);
    await load({ keepEdits: true });
    return true;
  }

  async function run(action: 'generate' | 'publish') {
    setBusy(true);
    setNote(null);
    setProblem(null);
    try {
      if (!(await save())) return;
      const res =
        action === 'generate'
          ? await fetch(`/api/projects/${projectId}/landing-page`, { method: 'POST' })
          : await fetch(`/api/projects/${projectId}/landing-page`, { method: 'PUT' });
      const body = await res.json();
      if (!res.ok) {
        setProblem(body.error ?? 'Something went wrong');
        return;
      }
      setNote(action === 'generate' ? 'Writing the page — this takes a minute.' : 'Publishing…');
      await load({ keepEdits: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span className="grid size-9 place-items-center rounded-[11px] bg-primary-soft">
          <Store className="size-4 text-primary" />
        </span>
        <p className="flex-1 text-sm font-semibold">Sales page</p>
        {page && (
          <Badge
            variant={
              page.state === 'PUBLISHED'
                ? 'success'
                : page.state === 'FAILED'
                  ? 'error'
                  : page.state === 'DRAFT'
                    ? 'warning'
                    : 'primary'
            }
          >
            {working && <Loader2 className="size-3 animate-spin" />}
            {page.state.toLowerCase()}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        {!projectCompleted && (
          <p className="text-sm text-muted-foreground">
            The sales page is written once the book has finished generating.
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Checkout link</span>
            <input
              value={checkoutUrl}
              onChange={(e) => setCheckoutUrl(e.target.value)}
              onBlur={() => void save()}
              placeholder="https://payhip.com/b/…"
              inputMode="url"
              className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </label>
          <label className="sm:w-32">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Price ({data.settings.currency})
            </span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => void save()}
              placeholder="47"
              inputMode="decimal"
              className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          Upload the book to your store, then paste its checkout link here — it goes on every buy button
          exactly as you enter it.
        </p>

        {page?.error && <p className="text-sm text-error">{page.error}</p>}
        {problem && <p className="text-sm text-error">{problem}</p>}
        {note && !problem && <p className="text-sm text-muted-foreground">{note}</p>}
        {!data.publisherConfigured && (
          <p className="text-sm text-warning">
            Publishing is unavailable until a Netlify token is configured on the server.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void run('generate')} disabled={working || !projectCompleted} size="sm">
            {working ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            {page?.hasDraft ? 'Rewrite page' : 'Write page'}
          </Button>

          {page?.hasDraft && (
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/projects/${projectId}/landing-page/preview`} target="_blank" rel="noreferrer">
                <Eye className="size-4" />
                Preview
              </a>
            </Button>
          )}

          {page?.hasDraft && (
            <Button
              onClick={() => void run('publish')}
              disabled={working || !data.canPublish}
              variant="secondary"
              size="sm"
              title={
                !data.publisherConfigured
                  ? 'Netlify is not configured on the server'
                  : !checkoutUrl.trim()
                    ? 'Add your checkout link first'
                    : 'Deploy this page to Netlify'
              }
            >
              <Rocket className="size-4" />
              {page.url ? 'Republish' : 'Publish'}
            </Button>
          )}

          {page?.url && (
            <Button asChild variant="ghost" size="sm">
              <a href={page.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                View live
              </a>
            </Button>
          )}
        </div>

        {page?.url && (
          <p className="break-all text-xs text-muted-foreground">
            Live at{' '}
            <a href={page.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {page.url}
            </a>
          </p>
        )}
      </div>
    </Card>
  );
}
