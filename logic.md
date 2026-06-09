```bash
# =============================================================================
# YOUTUBE EBOOK GENERATOR
# COMPLETE BUSINESS LOGIC PIPELINE
# FOR CLAUDE CODE IMPLEMENTATION
# =============================================================================

GOAL:
Convert a YouTube channel into a professionally written 80-120 page ebook
that feels like a commercially published Kindle book rather than a collection
of video summaries.

===============================================================================
PHASE 1 — CHANNEL INGESTION
===============================================================================

INPUT:
- YouTube Channel URL

PROCESS:

1. Validate Channel URL
2. Resolve Channel ID
3. Fetch Channel Metadata
4. Fetch Channel Statistics
5. Fetch Videos

OUTPUT:

Channel {
  channelId
  title
  description
  subscriberCount
  totalVideos
  thumbnail
}

===============================================================================
PHASE 2 — VIDEO SELECTION
===============================================================================

GOAL:
Select the most valuable videos instead of analyzing the entire channel.

RULES:

MAX_VIDEOS = 30

VIDEO_SCORE =
(
  views * 0.6
) +
(
  comments * 0.2
) +
(
  likes * 0.2
)

PROCESS:

1. Get all channel videos
2. Calculate score
3. Sort descending
4. Select Top 30 videos

OUTPUT:

SelectedVideos[]

===============================================================================
PHASE 3 — VIDEO DATA COLLECTION
===============================================================================

FOR EACH VIDEO:

Collect:

- Title
- Description
- Views
- Likes
- Comments
- Published Date
- Duration

Store:

Video {
  videoId
  metadata
  statistics
}

===============================================================================
PHASE 4 — TRANSCRIPT COLLECTION
===============================================================================

FOR EACH VIDEO:

TRY:

Youtube Transcript API

IF FAILED:

Whisper Fallback

OUTPUT:

Transcript {
  videoId
  transcript
  source
}

===============================================================================
PHASE 5 — VIDEO KNOWLEDGE EXTRACTION
===============================================================================

MODEL:
Claude Sonnet

FOR EACH VIDEO:

Extract:

{
  summary
  keyLessons[]
  mistakes[]
  frameworks[]
  actionableTips[]
  successStories[]
  caseStudies[]
  audienceProblems[]
  audienceGoals[]
  recurringAdvice[]
}

PURPOSE:

Transform raw transcript into structured knowledge.

OUTPUT:

VideoKnowledge[]

===============================================================================
PHASE 6 — COMMENT ANALYSIS
===============================================================================

MODEL:
Claude Haiku

FOR EACH VIDEO:

Analyze Top Comments

Extract:

{
  commonQuestions[]
  frustrations[]
  fears[]
  myths[]
  objections[]
  desiredResults[]
  recurringProblems[]
}

PURPOSE:

Understand audience psychology.

OUTPUT:

CommentInsights[]

===============================================================================
PHASE 7 — CHANNEL KNOWLEDGE BASE
===============================================================================

MODEL:
Claude Sonnet

INPUT:

- VideoKnowledge[]
- CommentInsights[]

GENERATE:

ChannelKnowledgeBase {

  coreThemes[]

  corePrinciples[]

  recurringAdvice[]

  commonMistakes[]

  audiencePainPoints[]

  audienceGoals[]

  transformationJourney

  expertPositioning

  hiddenInsights[]

}

EXAMPLE:

Theme:
"Prevent expensive car repairs"

Principle:
"Cars always show warning signs"

Audience Goal:
"Save money and avoid breakdowns"

OUTPUT:

ChannelKnowledgeBase

===============================================================================
PHASE 8 — BOOK STRATEGY GENERATION
===============================================================================

MODEL:
Claude Sonnet

INPUT:

ChannelKnowledgeBase

GENERATE:

BookStrategy {

  title

  subtitle

  targetAudience

  corePromise

  transformation

  authorVoice

  tone

  chapterCount

  targetWordCount

  uniqueSellingProposition

  keyPrinciples[]

}

EXAMPLE:

Title:
"The Mechanic's Bible"

Subtitle:
"101 Insider Secrets To Make Any Car Last 300,000 Miles"

Core Promise:
"Save thousands on repair costs"

Transformation:
"Clueless Owner -> Confident Vehicle Steward"

OUTPUT:

BookStrategy

===============================================================================
PHASE 9 — OUTLINE GENERATION
===============================================================================

MODEL:
Claude Sonnet

INPUT:

- BookStrategy
- ChannelKnowledgeBase

GENERATE:

12 Chapters

Each chapter:

{
  title
  purpose
  promise
  keyPoints[]
  wordTarget
}

OUTPUT:

Outline

Example:

Chapter 1:
Why Most Engines Die Early

Chapter 2:
The Language Your Car Uses To Warn You

Chapter 3:
The Hidden Maintenance Schedule

...

===============================================================================
PHASE 10 — CHAPTER RESEARCH PACKAGE
===============================================================================

MODEL:
Claude Sonnet

FOR EACH CHAPTER:

Collect:

{
  chapterTitle

  relatedVideos[]

  relatedComments[]

  supportingStories[]

  supportingLessons[]

  supportingExamples[]

  supportingCaseStudies[]

  supportingFrameworks[]

  supportingPrinciples[]
}

PURPOSE:

Provide deep context for long-form writing.

OUTPUT:

ChapterResearch[]

===============================================================================
PHASE 11 — CHAPTER GENERATION
===============================================================================

MODEL:
Claude Opus

FOR EACH CHAPTER:

INPUT:

- Book Strategy
- Outline
- Chapter Research
- Channel Summary

TARGET:

3500-4500 words

WRITING STYLE:

Professional Nonfiction

STRUCTURE:

1. Hook

2. Opening Story

3. Problem Introduction

4. Concept Explanation

5. Case Study

6. Framework

7. Practical Application

8. Action Steps

9. Chapter Summary

RULES:

- No transcript summaries
- No bullet point dumping
- Must feel like a real book
- Use storytelling
- Use authority tone
- Use examples
- Use analogies
- Use transitions

OUTPUT:

Chapter

===============================================================================
PHASE 12 — BOOK POLISHING
===============================================================================

MODEL:
Claude Opus

INPUT:

All Chapters

TASKS:

1. Remove repetition

2. Improve flow

3. Improve transitions

4. Maintain consistent voice

5. Maintain consistent tone

6. Ensure logical progression

7. Improve readability

OUTPUT:

Polished Manuscript

===============================================================================
PHASE 13 — OPTIONAL EXTRA CONTENT
===============================================================================

MODEL:
Claude Opus

USER CAN ADD:

- Introduction
- Foreword
- Conclusion
- FAQ
- Bonus Chapter
- Resources
- Checklist
- Glossary

INPUT:

User Prompt

OUTPUT:

New Section

===============================================================================
PHASE 14 — BOOK ASSEMBLY
===============================================================================

Create:

Front Matter:

- Cover
- Title Page
- Copyright
- Table of Contents

Body:

- Chapters
- Sections

Back Matter:

- Conclusion
- Resources
- Glossary
- About Author

OUTPUT:

Final Manuscript

===============================================================================
PHASE 15 — EXPORT
===============================================================================

Formats:

- PDF
- DOCX

Auto Select:

- Fonts
- Headings
- Margins
- Page Breaks

OUTPUT:

ExportArtifact

===============================================================================
UPDATED PIPELINE STATES
===============================================================================

CREATED

↓

INGESTING_CHANNEL

↓

FETCHING_VIDEO_DATA

↓

FETCHING_TRANSCRIPTS

↓

TRANSCRIBING_FALLBACK

↓

SUMMARIZING_VIDEOS

↓

ANALYZING_COMMENTS

↓

BUILDING_KNOWLEDGE_BASE

↓

GENERATING_BOOK_STRATEGY

↓

GENERATING_OUTLINE

↓

GENERATING_CHAPTER_RESEARCH

↓

GENERATING_CHAPTERS

↓

POLISHING_BOOK

↓

ASSEMBLING

↓

EXPORTING

↓

COMPLETED

===============================================================================
MODEL ROUTING
===============================================================================

CLAUDE HAIKU:

- Comment Analysis
- Sentiment Analysis
- Classification
- Pain Point Extraction

CLAUDE SONNET:

- Video Summaries
- Knowledge Extraction
- Channel Summary
- Book Strategy
- Outline Generation
- Research Package Generation

CLAUDE OPUS:

- Chapter Writing
- Book Polishing
- Chapter Regeneration
- Bonus Sections
- Final Editing

===============================================================================
WORD COUNT TARGET
===============================================================================

100 Pages

450 Words Per Page

Target:

45,000 Words

Distribution:

12 Chapters

3,750 Words Per Chapter

Expected Range:

42,000 - 48,000 Words

===============================================================================
SUCCESS METRIC
===============================================================================

The final ebook should feel like:

✓ A real Kindle book
✓ Professionally authored
✓ Story-driven
✓ Educational
✓ High-value
✓ Not AI summary content
✓ Not transcript summaries
✓ Suitable for sale or lead generation

END
# =============================================================================
```
