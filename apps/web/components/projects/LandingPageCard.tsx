'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Eye, Loader2, RotateCcw, Rocket, Store, Upload } from 'lucide-react';
import { Card } from '../ui/card.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';

type State = 'GENERATING' | 'DRAFT' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

type LandingMode = 'single' | 'triple';

/** How many other finished books a three-book page needs. */
const SIBLING_SLOTS = 2;

interface SiblingSetting {
  projectId: string;
  priceCents: number | null;
  checkoutUrl: string;
}

interface Payload {
  settings: {
    enabled: boolean;
    checkoutUrl: string;
    templateUrl: string;
    priceCents: number | null;
    currency: string;
    mode: LandingMode;
    siblings: SiblingSetting[];
    bundlePriceCents: number | null;
    bundleCheckoutUrl: string;
    /** Storage path of the uploaded author photo, or '' when there is none. */
    authorPhotoPath: string;
  };
  page: { state: State; url: string | null; error: string | null; hasDraft: boolean; updatedAt: string } | null;
  canPublish: boolean;
  /** 1-based positions of books with no buy link yet. */
  missingCheckoutPositions: number[];
  publisherConfigured: boolean;
}

/** A finished book of the user's that could be sold alongside this one. */
interface Candidate {
  projectId: string;
  title: string;
  sameChannel: boolean;
}

/** One sibling row's editable state. */
interface SiblingDraft {
  projectId: string;
  price: string;
  checkoutUrl: string;
}

const EMPTY_SIBLING: SiblingDraft = { projectId: '', price: '', checkoutUrl: '' };

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

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const INPUT =
  'h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary';

/**
 * The sales page panel, shown on every finished book.
 *
 * Everything happens here, after the book exists — which is the first moment the
 * user can have uploaded it to their store and have a checkout link to give.
 * Asking at project-creation time was the wrong moment: the product could not
 * exist yet, so the link never could either.
 */
export function LandingPageCard({ projectId, projectCompleted }: { projectId: string; projectCompleted: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [templateUrl, setTemplateUrl] = useState('');
  const [price, setPrice] = useState('');
  const [mode, setMode] = useState<LandingMode>('single');
  const [siblings, setSiblings] = useState<SiblingDraft[]>([EMPTY_SIBLING, EMPTY_SIBLING]);
  const [bundlePrice, setBundlePrice] = useState('');
  const [bundleUrl, setBundleUrl] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The row this card was showing when an action was fired. Work runs on a
  // queue, so for the first few seconds the row still reads DRAFT — polling on
  // the state alone would never start, and the card would sit on "Publishing…"
  // until the user reloaded. Watching for the row to CHANGE is what actually
  // tracks the job.
  const [watchFrom, setWatchFrom] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { keepEdits?: boolean }) => {
      const res = await fetch(`/api/projects/${projectId}/landing-page`);
      if (!res.ok) return;
      const payload = (await res.json()) as Payload;
      setData(payload);
      // Don't clobber what the user is mid-way through typing.
      if (!opts?.keepEdits) {
        setCheckoutUrl(payload.settings.checkoutUrl);
        setTemplateUrl(payload.settings.templateUrl);
        setPrice(centsToInput(payload.settings.priceCents));
        setMode(payload.settings.mode);
        setBundlePrice(centsToInput(payload.settings.bundlePriceCents));
        setBundleUrl(payload.settings.bundleCheckoutUrl);
        // Always render both slots, filling whichever are already saved, so the
        // picker's shape doesn't change as the user completes it.
        setSiblings(
          Array.from({ length: SIBLING_SLOTS }, (_, i) => {
            const saved = payload.settings.siblings[i];
            return saved
              ? { projectId: saved.projectId, price: centsToInput(saved.priceCents), checkoutUrl: saved.checkoutUrl }
              : EMPTY_SIBLING;
          }),
        );
      }
    },
    [projectId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The user's other finished books. Fetched once: without at least two, the
  // 3-ebook option cannot be offered at all.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/projects/${projectId}/landing-page/candidates`);
      if (!res.ok) {
        if (!cancelled) setCandidates([]);
        return;
      }
      const body = (await res.json()) as { candidates: Candidate[] };
      if (!cancelled) setCandidates(body.candidates);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const state = data?.page?.state ?? null;
  const updatedAt = data?.page?.updatedAt ?? null;

  // Poll while a job is in flight, and while one is expected but has not been
  // picked up yet. Stops once the row has moved on from what it was when the
  // action fired and is no longer working — or after a deadline, so a job that
  // dies without writing a row can't leave this polling forever.
  const inFlight = state !== null && BUSY_STATES.includes(state);
  const awaiting = watchFrom !== null && updatedAt === watchFrom;
  useEffect(() => {
    if (!inFlight && !awaiting) {
      if (watchFrom !== null) setWatchFrom(null);
      return;
    }
    const deadline = Date.now() + 240_000;
    const t = setInterval(() => {
      if (Date.now() > deadline) {
        setWatchFrom(null);
        return;
      }
      void load({ keepEdits: true });
    }, 3000);
    return () => clearInterval(t);
  }, [inFlight, awaiting, watchFrom, load]);

  // The panel only makes sense once there is a book to sell.
  if (!projectCompleted) return null;

  const page = data?.page ?? null;
  const working = busy || (state !== null && BUSY_STATES.includes(state));
  // Server-computed, so the button and its explanation agree with the gate
  // that will actually run.
  const missingLinks = data?.missingCheckoutPositions ?? [];

  /** Persists the settings, and turns the feature on for this project. */
  async function save(): Promise<boolean> {
    const cents = parsePrice(price);
    if (price.trim() && cents === null) {
      setProblem('Enter the price as a number, e.g. 27 or 27.00.');
      return false;
    }
    if (checkoutUrl.trim() && !isHttpUrl(checkoutUrl.trim())) {
      setProblem('The checkout link must be a full URL, e.g. https://payhip.com/b/AbCd.');
      return false;
    }
    if (templateUrl.trim() && !isHttpUrl(templateUrl.trim())) {
      setProblem('The reference page must be a full URL, e.g. https://eliasyoder.com.');
      return false;
    }

    // A three-book page needs all three books chosen before it can be saved as
    // one — the domain rejects a `triple` project with the wrong count, and
    // failing here says so in terms of the picker rather than at generation.
    const chosen = mode === 'triple' ? siblings.filter((s) => s.projectId) : [];
    if (mode === 'triple' && chosen.length < SIBLING_SLOTS) {
      setProblem('Pick both of the other books before saving the 3-ebook page.');
      return false;
    }
    if (new Set(chosen.map((s) => s.projectId)).size !== chosen.length) {
      setProblem('Pick two different books — the same book cannot be sold twice on one page.');
      return false;
    }
    for (const [i, s] of chosen.entries()) {
      if (s.price.trim() && parsePrice(s.price) === null) {
        setProblem(`Enter book ${i + 2}'s price as a number, e.g. 27 or 27.00.`);
        return false;
      }
      if (s.checkoutUrl.trim() && !isHttpUrl(s.checkoutUrl.trim())) {
        setProblem(`Book ${i + 2}'s checkout link must be a full URL.`);
        return false;
      }
    }
    if (bundlePrice.trim() && parsePrice(bundlePrice) === null) {
      setProblem('Enter the bundle price as a number, e.g. 47 or 47.00.');
      return false;
    }
    if (bundleUrl.trim() && !isHttpUrl(bundleUrl.trim())) {
      setProblem('The bundle checkout link must be a full URL.');
      return false;
    }

    const bundleCents = parsePrice(bundlePrice);
    const res = await fetch(`/api/projects/${projectId}/landing-page`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        landingPage: true,
        landingCheckoutUrl: checkoutUrl.trim(),
        landingTemplateUrl: templateUrl.trim(),
        ...(cents !== null ? { landingPriceCents: cents } : {}),
        landingMode: mode,
        landingSiblings: chosen.map((s) => {
          const sibCents = parsePrice(s.price);
          return {
            projectId: s.projectId,
            ...(sibCents !== null ? { priceCents: sibCents } : {}),
            checkoutUrl: s.checkoutUrl.trim(),
          };
        }),
        ...(mode === 'triple' && bundleCents !== null ? { landingBundlePriceCents: bundleCents } : {}),
        ...(mode === 'triple' ? { landingBundleCheckoutUrl: bundleUrl.trim() } : {}),
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

  /**
   * The author's photograph. Uploaded separately from the settings form because
   * it is a file, and stored rather than embedded so it survives regeneration.
   */
  async function uploadPhoto(file: File) {
    setUploading(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/landing-page/avatar`, { method: 'POST', body: form });
      if (!res.ok) {
        setProblem((await res.json()).error ?? 'Could not upload that image');
        return;
      }
      await load({ keepEdits: true });
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setUploading(true);
    try {
      await fetch(`/api/projects/${projectId}/landing-page/avatar`, { method: 'DELETE' });
      await load({ keepEdits: true });
    } finally {
      setUploading(false);
    }
  }

  async function run(action: 'generate' | 'publish') {
    setBusy(true);
    setNote(null);
    setProblem(null);
    try {
      if (!(await save())) return;
      const res = await fetch(`/api/projects/${projectId}/landing-page`, {
        method: action === 'generate' ? 'POST' : 'PUT',
      });
      const body = await res.json();
      if (!res.ok) {
        setProblem(body.error ?? 'Something went wrong');
        return;
      }
      setNote(action === 'generate' ? 'Writing the page — this takes a minute.' : 'Publishing…');
      // Remember the row as it stands, so polling can watch for it to change.
      setWatchFrom(data?.page?.updatedAt ?? 'none');
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
        {!page && (
          <p className="text-sm text-muted-foreground">
            Turn this book into a sales page — written from its own contents, styled from its cover, and hosted
            on Netlify.
          </p>
        )}

        {/* How many books this page sells. The choice picks the template, and
            a 3-ebook page only ever uses the 3-ebook template. */}
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">What this page sells</span>
          <div className="flex gap-2">
            {(
              [
                ['single', 'This book', null],
                [
                  'triple',
                  '3 ebooks',
                  candidates !== null && candidates.length < SIBLING_SLOTS
                    ? 'Needs 2 other finished books'
                    : null,
                ],
              ] as const
            ).map(([value, label, blocked]) => (
              <button
                key={value}
                type="button"
                disabled={Boolean(blocked)}
                title={blocked ?? undefined}
                onClick={() => {
                  setMode(value);
                  setProblem(null);
                }}
                className={`h-9 flex-1 rounded-md border px-3 text-sm transition-colors ${
                  mode === value
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-canvas text-muted-foreground hover:border-primary/40'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>
          {candidates !== null && candidates.length < SIBLING_SLOTS && (
            <p className="mt-1 text-xs text-muted-foreground">
              A 3-ebook page needs two other finished books. Generate more books to unlock it.
            </p>
          )}
        </div>

        {mode === 'triple' && (
          <div className="flex flex-col gap-4 rounded-md border border-border p-4">
            <p className="text-xs text-muted-foreground">
              This book is sold first. Pick the other two and give each its own price and checkout link — every buy
              button goes to the book it sits under.
            </p>

            {siblings.map((sibling, i) => (
              <div key={i} className="flex flex-col gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Book {i + 2}</span>
                  <select
                    value={sibling.projectId}
                    onChange={(e) => {
                      const next = [...siblings];
                      next[i] = { ...sibling, projectId: e.target.value };
                      setSiblings(next);
                    }}
                    onBlur={() => void save()}
                    className={INPUT}
                  >
                    <option value="">Choose a finished book…</option>
                    {(candidates ?? [])
                      // Can't sell the same book twice on one page.
                      .filter((c) => c.projectId === sibling.projectId || !siblings.some((s) => s.projectId === c.projectId))
                      .map((c) => (
                        <option key={c.projectId} value={c.projectId}>
                          {c.title}
                          {c.sameChannel ? '' : ' (different channel)'}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex-1">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Checkout link</span>
                    <input
                      value={sibling.checkoutUrl}
                      onChange={(e) => {
                        const next = [...siblings];
                        next[i] = { ...sibling, checkoutUrl: e.target.value };
                        setSiblings(next);
                      }}
                      onBlur={() => void save()}
                      placeholder="https://payhip.com/b/…"
                      inputMode="url"
                      className={INPUT}
                    />
                  </label>
                  <label className="sm:w-32">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      Price ({data?.settings.currency ?? 'USD'})
                    </span>
                    <input
                      value={sibling.price}
                      onChange={(e) => {
                        const next = [...siblings];
                        next[i] = { ...sibling, price: e.target.value };
                        setSiblings(next);
                      }}
                      onBlur={() => void save()}
                      placeholder="27"
                      inputMode="decimal"
                      className={INPUT}
                    />
                  </label>
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
              <label className="flex-1">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Bundle checkout link (optional)
                </span>
                <input
                  value={bundleUrl}
                  onChange={(e) => setBundleUrl(e.target.value)}
                  onBlur={() => void save()}
                  placeholder="https://payhip.com/b/…"
                  inputMode="url"
                  className={INPUT}
                />
              </label>
              <label className="sm:w-32">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Bundle price</span>
                <input
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                  onBlur={() => void save()}
                  placeholder="47"
                  inputMode="decimal"
                  className={INPUT}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave the bundle empty to sell the books individually only. The saving shown is calculated from the
              three prices above.
            </p>
          </div>
        )}

        {/* Optional. The reference pages put a real portrait in the hero; with
            no photo the layout falls back to the cover. */}
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Author photo <span className="font-normal">(optional)</span>
          </span>
          <div className="flex items-center gap-3">
            <label
              className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-canvas px-3 text-sm text-muted-foreground hover:border-primary/40 ${
                uploading ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {data?.settings.authorPhotoPath ? 'Replace photo' : 'Upload photo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Cleared so picking the same file twice still fires onChange.
                  e.target.value = '';
                  if (file) void uploadPhoto(file);
                }}
              />
            </label>
            {data?.settings.authorPhotoPath && (
              <Button variant="ghost" size="sm" onClick={() => void removePhoto()} disabled={uploading}>
                Remove
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            A photo of the author, used in the hero and beside the bio. PNG, JPEG or WebP, up to 5MB. Your channel
            avatar is used as the small logo either way.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Reference page to copy the layout from
          </span>
          <input
            value={templateUrl}
            onChange={(e) => setTemplateUrl(e.target.value)}
            onBlur={() => void save()}
            placeholder="https://eliasyoder.com"
            inputMode="url"
            className={INPUT}
          />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {mode === 'triple' ? 'Book 1 checkout link (this book)' : 'Checkout link'}
            </span>
            <input
              value={checkoutUrl}
              onChange={(e) => setCheckoutUrl(e.target.value)}
              onBlur={() => void save()}
              placeholder="https://payhip.com/b/…"
              inputMode="url"
              className={INPUT}
            />
          </label>
          <label className="sm:w-32">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Price ({data?.settings.currency ?? 'USD'})
            </span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => void save()}
              placeholder="27"
              inputMode="decimal"
              className={INPUT}
            />
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          Download the book below, upload it to Payhip, then paste its checkout link here — it goes on every buy
          button exactly as you enter it. You can write the page first and add the link before publishing.
        </p>

        {page?.hasDraft && missingLinks.length > 0 && (
          <p className="text-sm text-warning">
            {missingLinks.length === 1 ? 'Book' : 'Books'} {missingLinks.join(', ')}{' '}
            {missingLinks.length === 1 ? 'has' : 'have'} no checkout link yet — the page can be previewed but not
            published until {missingLinks.length === 1 ? 'it does' : 'they do'}.
          </p>
        )}

        {page?.error && <p className="text-sm text-error">{page.error}</p>}
        {problem && <p className="text-sm text-error">{problem}</p>}
        {note && !problem && <p className="text-sm text-muted-foreground">{note}</p>}
        {data && !data.publisherConfigured && (
          <p className="text-sm text-warning">
            Publishing is unavailable until a Netlify token is configured on the server.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void run('generate')} disabled={working} size="sm">
            {working ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            {page?.hasDraft ? 'Rewrite page' : 'Generate landing page'}
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
              disabled={working || !data?.canPublish}
              variant="secondary"
              size="sm"
              title={
                !data?.publisherConfigured
                  ? 'Netlify is not configured on the server'
                  : missingLinks.length > 0
                    ? `Add a checkout link for ${missingLinks.length === 1 ? 'book' : 'books'} ${missingLinks.join(', ')} first`
                    : 'Deploy this page to Netlify'
              }
            >
              <Rocket className="size-4" />
              {page.url ? 'Republish' : 'Publish to Netlify'}
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
