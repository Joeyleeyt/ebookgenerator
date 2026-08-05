/**
 * Runs the template CAPTURE stage against a URL and prints what it found.
 *
 * Standalone on purpose: no database, no Redis, no Anthropic key, no worker.
 * The capture stage is entirely deterministic — render, clean, stamp, measure —
 * so everything it decides can be checked without any of that, and the whole
 * diagnose loop becomes one command instead of a deploy.
 *
 *   npx tsx scripts/probe-template.ts https://themechanicbible.com/
 *   npx tsx scripts/probe-template.ts https://example.com/ --json > out.json
 *
 * What it CANNOT tell you: whether the annotation model labels the right nodes.
 * That needs the key and the queue. Everything before it is here.
 */
import { PuppeteerTemplateCapturer } from '../packages/infrastructure/src/net/PuppeteerTemplateCapturer.js';
import { SharpPageDiffer } from '../packages/infrastructure/src/landing/SharpPageDiffer.js';

const url = process.argv[2];
const asJson = process.argv.includes('--json');

if (!url) {
  console.error('usage: npx tsx scripts/probe-template.ts <url> [--json]');
  process.exit(1);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(3)}%`;
}

async function main(): Promise<void> {
  if (!asJson) console.error(`capturing ${url} …`);

  const captured = await new PuppeteerTemplateCapturer().capture(url);
  if (captured.isFail()) {
    console.error(`FAILED: ${captured.error}`);
    process.exit(1);
  }
  const page = captured.value;

  // The number the whole approach turns on: how much the page changes when its
  // scripts are removed. Everything else can be worked around; this cannot.
  const diff = await new SharpPageDiffer().compare({
    baseline: page.baselineShots,
    candidate: page.cleanedShots,
  });

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          finalUrl: page.finalUrl,
          title: page.title,
          cleaningLoss: diff.isOk() ? diff.value : null,
          sections: page.sections.length,
          inventory: page.inventory.length,
          ctas: page.ctaIds.length,
          repeaters: page.repeaters,
          theme: page.theme,
          contentImages: page.contentImages,
          notes: page.notes,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n── ${page.title || page.finalUrl} ──`);
  console.log(`url            ${page.finalUrl}`);
  console.log(`sections       ${page.sections.length}`);
  console.log(`inventory      ${page.inventory.length} candidate nodes`);
  console.log(`buy buttons    ${page.ctaIds.length}`);
  console.log(`content images ${page.contentImages.length}`);
  console.log(`css            ${(page.css.length / 1024).toFixed(0)} KB`);
  console.log(`assets         ${page.assets.length}`);
  console.log(`accent         ${page.theme.accentValue ?? '(none)'} via ${page.theme.accentToken ?? 'literal'}`);
  console.log(`polarity       ${page.theme.isDark ? 'dark' : 'light'}`);

  console.log('\ncleaning loss  (how much the page changes with scripts removed)');
  if (diff.isOk()) {
    for (const r of diff.value) {
      const verdict = r.mismatchRatio < 0.02 ? 'OK' : r.mismatchRatio < 0.2 ? 'MARGINAL' : 'BAD';
      console.log(`  ${String(r.width).padStart(5)}px  ${pct(r.mismatchRatio).padStart(9)}  ${verdict}`);
    }
  } else {
    console.log(`  could not measure: ${diff.error}`);
  }

  console.log(`\nrepeating regions detected  (${page.repeaters.length})`);
  if (page.repeaters.length === 0) {
    console.log('  NONE — every repeating section would have to be labelled by hand.');
  }
  for (const r of page.repeaters) {
    const sample = page.inventory.find((n) => n.tplId === r.itemTplId)?.text ?? '';
    console.log(
      `  ${r.containerTplId.padEnd(7)} ${String(r.originalCount).padStart(2)} items  ` +
        `${r.flexibleCount ? 'reflows' : 'fixed  '}  "${sample.slice(0, 60)}"`,
    );
  }

  if (page.notes.length > 0) {
    console.log('\nnotes');
    for (const note of page.notes) console.log(`  · ${note}`);
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
