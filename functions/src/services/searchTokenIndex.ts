import {createLogger} from "./logging";

const SEARCH_TOKEN_SPLIT_PATTERN = /[^a-z0-9]+/g;

export interface SearchTokenIndexSource {
  chapter: string;
  questionTextKeywords?: string[];
  subject: string;
  tags: string[];
}

export interface SearchTokenIndexResult {
  searchTokens: string[];
}

const normalizeKeywordToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const tokenizeValue = (value: string): string[] =>
  value
    .toLowerCase()
    .split(SEARCH_TOKEN_SPLIT_PATTERN)
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeKeywordList = (keywords: string[] | undefined): string[] => {
  if (!keywords) {
    return [];
  }

  return keywords
    .filter((keyword): keyword is string => typeof keyword === "string")
    .map(normalizeKeywordToken)
    .filter(Boolean);
};

/**
 * Generates deterministic lightweight search tokens for question documents.
 */
export class SearchTokenIndexService {
  private readonly logger = createLogger("SearchTokenIndexService");

  /**
   * Builds a deduplicated search token list from indexed question metadata.
   * @param {SearchTokenIndexSource} source
   * Indexed metadata used for token generation.
   * @return {SearchTokenIndexResult}
   * Deduplicated search tokens sorted for stable writes.
   */
  public generateTokens(
    source: SearchTokenIndexSource,
  ): SearchTokenIndexResult {
    const questionTextKeywords = normalizeKeywordList(
      source.questionTextKeywords,
    );
    const tokenValues = [
      ...tokenizeValue(source.subject),
      ...tokenizeValue(source.chapter),
      ...source.tags.flatMap((tag) => tokenizeValue(tag)),
      ...questionTextKeywords.flatMap((keyword) => tokenizeValue(keyword)),
    ];
    const searchTokens = Array.from(new Set(tokenValues)).sort();

    this.logger.info("Search tokens generated", {
      chapter: source.chapter,
      keywordCount: questionTextKeywords.length,
      searchTokenCount: searchTokens.length,
      subject: source.subject,
      tagCount: source.tags.length,
    });

    return {searchTokens};
  }
}

export const searchTokenIndexService = new SearchTokenIndexService();
