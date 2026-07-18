import {
  KeywordSpotter,
  damerauLevenshtein,
  normalizeTokens,
  tokenMatches,
  type CampaignTerms,
} from '../src/lib/keywords';

const REAL: CampaignTerms[] = [
  { campaignId: 'elevenlabs', keywords: ['elevenlabs', 'eleven labs'] },
  { campaignId: 'openai', keywords: ['openai', 'open ai'] },
  { campaignId: 'anthropic', keywords: ['anthropic'] },
];

function spotter(campaigns: CampaignTerms[] = REAL) {
  return new KeywordSpotter(campaigns, { suppressMs: 8000 });
}

describe('normalizeTokens', () => {
  it('lowercases, strips punctuation, and tokenizes', () => {
    expect(normalizeTokens('Anthropic!')).toEqual(['anthropic']);
    expect(normalizeTokens("open, AI.")).toEqual(['open', 'ai']);
  });

  it('strips NFKD combining marks', () => {
    // "anthröpic" with a combining diaeresis normalizes to "anthropic".
    expect(normalizeTokens('anthröpic')).toEqual(['anthropic']);
  });
});

describe('damerauLevenshtein', () => {
  it('counts substitutions, transpositions, and indels', () => {
    expect(damerauLevenshtein('anthropik', 'anthropic')).toBe(1);
    expect(damerauLevenshtein('ab', 'ba')).toBe(1); // transposition
    expect(damerauLevenshtein('openai', 'openai')).toBe(0);
    expect(damerauLevenshtein('openair', 'openai')).toBe(1); // trailing insert
  });
});

describe('tokenMatches', () => {
  it('rejects boundary prefix/suffix extensions even at DL 1', () => {
    expect(tokenMatches('openair', 'openai')).toBe(false);
    expect(tokenMatches('elevenlabsy', 'elevenlabs')).toBe(false);
  });
  it('accepts equal-length typos on >=5-char terms', () => {
    expect(tokenMatches('anthropik', 'anthropic')).toBe(true);
  });
  it('is exact-only for <=4-char terms', () => {
    expect(tokenMatches('jazm', 'jazz')).toBe(false);
    expect(tokenMatches('jazz', 'jazz')).toBe(true);
  });
});

describe('KeywordSpotter', () => {
  it('fires an exact hit', () => {
    const hits = spotter().partial('i love anthropic', 1000);
    expect(hits.map((h) => h.campaignId)).toEqual(['anthropic']);
    expect(hits[0].keyword).toBe('anthropic');
  });

  it('fires a fuzzy hit "anthropik" -> anthropic (DL 1, len >= 5)', () => {
    const hits = spotter().partial('so i tried anthropik yesterday', 1000);
    expect(hits.map((h) => h.campaignId)).toEqual(['anthropic']);
  });

  it('matches multi-token terms "open ai" and "eleven labs"', () => {
    const s = spotter();
    expect(s.partial('i use open ai daily', 1000).map((h) => h.campaignId)).toEqual(['openai']);
    expect(s.final('eleven labs is wild', 20000).map((h) => h.campaignId)).toEqual(['elevenlabs']);
  });

  it('does not fuzz <=4-char term tokens', () => {
    const s = new KeywordSpotter([{ campaignId: 'x', keywords: ['jazz'] }], { suppressMs: 8000 });
    expect(s.partial('some jazm playing', 1000)).toHaveLength(0);
    expect(s.partial('some jazz playing', 20000)).toHaveLength(1);
  });

  it('strips plural/possessive: "anthropics" -> hit', () => {
    expect(spotter().partial('two anthropics walk in', 1000).map((h) => h.campaignId)).toEqual([
      'anthropic',
    ]);
  });

  it('does NOT match boundary extensions ("openair", "elevenlabsy")', () => {
    const s = spotter();
    expect(s.partial('we sat in the openair today', 1000)).toHaveLength(0);
    expect(s.partial('elevenlabsy vibes only', 20000)).toHaveLength(0);
    // "open air" (two tokens) also must not match "open ai".
    expect(s.partial('fresh open air please', 40000)).toHaveLength(0);
  });

  it('dedupes partial rewrites and fires the delta on a real increase', () => {
    const s = spotter();
    expect(s.partial('so i tried anthropic', 1000)).toHaveLength(1);
    // Rewritten partial, same single occurrence -> nothing new.
    expect(s.partial('so i really tried anthropic today', 1500)).toHaveLength(0);
    // A genuine 2nd occurrence, spaced beyond the 8s window -> fires.
    expect(s.partial('anthropic is great and anthropic rocks', 10000)).toHaveLength(1);
  });

  it('never retracts an already-fired hit on FINAL reconcile', () => {
    const s = spotter();
    // Double occurrence in one partial -> suppression caps to 1 fired.
    expect(s.partial('i love anthropic anthropic', 1000)).toHaveLength(1);
    // FINAL commits fewer occurrences; must not retract or re-fire.
    expect(s.final('i love anthropic', 2000)).toHaveLength(0);
  });

  it('suppresses within 8s then re-arms (per campaign)', () => {
    const s = spotter();
    expect(s.final('i love anthropic', 1000)).toHaveLength(1);
    expect(s.final('anthropic again', 5000)).toHaveLength(0); // within 8s
    expect(s.final('anthropic later', 10000)).toHaveLength(1); // re-armed
  });

  it('does not cross-suppress different campaigns', () => {
    const hits = spotter().final('i love anthropic and openai', 1000);
    expect(hits.map((h) => h.campaignId).sort()).toEqual(['anthropic', 'openai']);
  });
});
