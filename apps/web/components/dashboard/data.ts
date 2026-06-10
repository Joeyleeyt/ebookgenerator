/**
 * Dashboard data contract.
 *
 * `projects` is REAL (from /api/projects). The intelligence sections below —
 * channel analytics, audience insights, and book opportunities — describe data
 * the pipeline already computes internally (comment analysis, knowledge base,
 * book strategy) but does NOT yet expose over an API. They're typed here as a
 * first-class contract and rendered with clearly-labelled SAMPLE values so the
 * UI ships now and the backend work to populate it is a well-defined next step.
 *
 * To make these live: surface aggregates from CommentInsights / ChannelKnowledge
 * / BookStrategy on the project and replace SAMPLE_* with the fetched payload.
 */

export interface ProjectItem {
  id: string;
  channelUrl: string;
  status: string;
  createdAt: string;
}

export interface ChannelMetric {
  key: string;
  label: string;
  value: string;
  /** Period-over-period delta, e.g. +12.4 (%). Null when unknown. */
  delta: number | null;
  spark: number[];
}

export interface AudienceInsight {
  /** 'topic' | 'question' | 'gap' */
  kind: 'topic' | 'question' | 'gap';
  text: string;
  /** Demand 0–100. */
  weight: number;
}

export interface BookOpportunity {
  id: string;
  title: string;
  angle: string;
  opportunity: number; // 0–100 composite
  demand: number; // 0–100
  revenue: 'High' | 'Medium' | 'Emerging';
  estPages: number;
}

// ── SAMPLE intelligence (pending backend exposure) ──────────────────────────

export const SAMPLE_METRICS: ChannelMetric[] = [
  { key: 'subs', label: 'Subscribers', value: '184.2K', delta: 4.1, spark: [40, 44, 43, 50, 55, 61, 68] },
  { key: 'views', label: '28-day views', value: '2.7M', delta: 12.4, spark: [30, 35, 33, 48, 52, 49, 70] },
  { key: 'eng', label: 'Engagement rate', value: '7.8%', delta: 1.6, spark: [55, 52, 58, 57, 62, 60, 66] },
  { key: 'growth', label: 'Audience growth', value: '+9.3K', delta: -2.2, spark: [60, 66, 62, 58, 61, 55, 52] },
];

export const SAMPLE_INSIGHTS: AudienceInsight[] = [
  { kind: 'topic', text: 'Pricing strategy for solo consultants', weight: 92 },
  { kind: 'question', text: '“How do I find my first 10 clients?”', weight: 88 },
  { kind: 'gap', text: 'No content on retainer contracts', weight: 81 },
  { kind: 'topic', text: 'Productizing a service offer', weight: 77 },
  { kind: 'question', text: '“What should I charge as a beginner?”', weight: 74 },
  { kind: 'gap', text: 'Cold outreach templates rarely covered', weight: 69 },
];

export const SAMPLE_OPPORTUNITIES: BookOpportunity[] = [
  {
    id: 'op-1',
    title: 'The Solo Consultant Pricing Playbook',
    angle: 'Turn your most-asked pricing questions into a confidence system.',
    opportunity: 94,
    demand: 91,
    revenue: 'High',
    estPages: 128,
  },
  {
    id: 'op-2',
    title: 'First 10 Clients',
    angle: 'A step-by-step path from zero audience to a booked pipeline.',
    opportunity: 88,
    demand: 86,
    revenue: 'High',
    estPages: 112,
  },
  {
    id: 'op-3',
    title: 'Productize Your Expertise',
    angle: 'Package what you already know into a scalable offer.',
    opportunity: 79,
    demand: 74,
    revenue: 'Medium',
    estPages: 104,
  },
];
