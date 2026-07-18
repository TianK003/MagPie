/**
 * KeywordSpotter — client-side, instant, pure TypeScript (plan §Keyword spotter,
 * mobile.md §3.5). This is what makes the reward feel live: partial transcripts
 * are matched against opted-in campaign terms on-device and a hit fires the UI
 * immediately. The server (verify-mention) is the paying authority; this is UX.
 *
 * Semantics are EXACT — see the module doc-comments per method. No RN imports.
 */

/** A campaign's opted-in terms as they arrive from the campaigns row. */
export interface CampaignTerms {
  campaignId: string;
  /** brand name + server-curated variants, e.g. ["elevenlabs", "eleven labs"]. */
  keywords: string[];
}

/** A fired keyword hit. `tMs` is the session-elapsed time supplied by the caller. */
export interface Hit {
  campaignId: string;
  termId: string;
  keyword: string;
  tMs: number;
}

interface CompiledTerm {
  campaignId: string;
  termId: string;
  keyword: string;
  tokens: string[];
}

const DEFAULT_SUPPRESS_MS = 8000;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Normalize text -> token array. Applied identically to campaign terms at
 * compile time and transcripts at match time:
 *   lowercase -> NFKD strip combining marks -> punctuation->space -> tokenize.
 * Matching is therefore token-sequence based and word-boundary anchored BY
 * CONSTRUCTION — a keyword can never match inside a longer word.
 */
export function normalizeTokens(input: string): string[] {
  const lowered = input.toLowerCase();
  const stripped = lowered.normalize('NFKD').replace(COMBINING_MARKS, '');
  // Anything that isn't a letter or number becomes a separator.
  const spaced = stripped.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return spaced.split(' ').filter((t) => t.length > 0);
}

/** Optimal-string-alignment distance, early-exiting once it exceeds `max`. */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prevPrev = new Array<number>(bl + 1).fill(0);
  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, prevPrev[j - 2] + 1); // transposition
      }
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > max) return max + 1;
    const tmp = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bl];
}

/** Candidate forms of a transcript token after stripping a trailing plural/possessive. */
function depluralize(token: string): string[] {
  const forms = [token];
  if (token.endsWith('es') && token.length > 2) forms.push(token.slice(0, -2));
  if (token.endsWith('s') && token.length > 1) forms.push(token.slice(0, -1));
  return forms;
}

/**
 * Does a transcript token match a term token?
 *  1. exact, after stripping a trailing 's'/'es' (plural/possessive), OR
 *  2. term-token length >= 5 and Damerau-Levenshtein <= 1 — BUT never when the
 *     shorter token is a boundary prefix/suffix of the longer one (that's a
 *     different, longer word: "openair" !~ "openai", "elevenlabsy" !~ "elevenlabs").
 *  Length <= 4 term tokens are exact-only (protects "crisp"/"open"/"labs").
 */
export function tokenMatches(transcriptToken: string, termToken: string): boolean {
  for (const form of depluralize(transcriptToken)) {
    if (form === termToken) return true;
  }
  if (termToken.length < 5) return false;

  const d = damerauLevenshtein(transcriptToken, termToken, 1);
  if (d !== 1) return false;

  if (transcriptToken.length !== termToken.length) {
    // A single insertion/deletion. If the shorter is a boundary prefix/suffix
    // of the longer, it's a word-boundary violation (keyword + extra letters),
    // not a typo — reject.
    const [short, long] =
      transcriptToken.length < termToken.length
        ? [transcriptToken, termToken]
        : [termToken, transcriptToken];
    if (long.startsWith(short) || long.endsWith(short)) return false;
  }
  return true;
}

/** Count non-overlapping occurrences of a k-token term inside a token array. */
function countOccurrences(tokens: string[], termTokens: string[]): number {
  const k = termTokens.length;
  if (k === 0 || tokens.length < k) return 0;
  let count = 0;
  let i = 0;
  outer: while (i + k <= tokens.length) {
    for (let j = 0; j < k; j++) {
      if (!tokenMatches(tokens[i + j], termTokens[j])) {
        i++;
        continue outer;
      }
    }
    count++;
    i += k; // non-overlapping
  }
  return count;
}

/**
 * Stateful spotter. Feed it `partial(text, tMs)` and `final(text, tMs)`; it
 * returns the hits fired on that call (usually 0 or 1). See method docs for the
 * dedupe + suppression rules.
 */
export class KeywordSpotter {
  private readonly terms: CompiledTerm[];
  private readonly suppressMs: number;

  /** Per-utterance occurrence counts already fired, keyed by termId. */
  private firedCount = new Map<string, number>();
  /** Last hit time per campaign, for the suppression window. Persists across utterances. */
  private lastCampaignHitMs = new Map<string, number>();

  constructor(campaigns: CampaignTerms[], opts?: { suppressMs?: number }) {
    this.suppressMs = opts?.suppressMs ?? DEFAULT_SUPPRESS_MS;
    this.terms = [];
    for (const c of campaigns) {
      c.keywords.forEach((kw, idx) => {
        const tokens = normalizeTokens(kw);
        if (tokens.length === 0) return;
        this.terms.push({
          campaignId: c.campaignId,
          termId: `${c.campaignId}#${idx}`,
          keyword: kw,
          tokens,
        });
      });
    }
  }

  /**
   * Process a PARTIAL. Partials mutate as the recognizer revises, so we count
   * occurrences of each term in the whole utterance and fire only the INCREASE
   * over what we've already fired (a reorder that keeps one occurrence fires
   * nothing). Each fired hit is additionally gated by the per-campaign
   * suppression window.
   */
  partial(text: string, tMs: number): Hit[] {
    return this.scan(text, tMs);
  }

  /**
   * Process a FINAL. The committed text is authoritative: reconcile counts
   * (fire any not-yet-fired occurrences) but NEVER retract an already-fired UI
   * hit — the server verify is the corrector. Then reset per-utterance state so
   * the next utterance starts fresh. The suppression window persists.
   */
  final(text: string, tMs: number): Hit[] {
    const hits = this.scan(text, tMs);
    this.firedCount.clear();
    return hits;
  }

  /** Wipe all state (utterance counts + suppression). Used on session reset. */
  reset(): void {
    this.firedCount.clear();
    this.lastCampaignHitMs.clear();
  }

  private scan(text: string, tMs: number): Hit[] {
    const tokens = normalizeTokens(text);
    const hits: Hit[] = [];
    for (const term of this.terms) {
      const n = countOccurrences(tokens, term.tokens);
      const alreadyFired = this.firedCount.get(term.termId) ?? 0;
      if (n <= alreadyFired) continue;

      // Advance the fired count regardless of suppression, so these occurrences
      // are never re-fired later within the same utterance.
      this.firedCount.set(term.termId, n);

      const last = this.lastCampaignHitMs.get(term.campaignId);
      if (last !== undefined && tMs - last < this.suppressMs) continue; // suppressed

      this.lastCampaignHitMs.set(term.campaignId, tMs);
      hits.push({
        campaignId: term.campaignId,
        termId: term.termId,
        keyword: term.keyword,
        tMs,
      });
    }
    return hits;
  }
}
