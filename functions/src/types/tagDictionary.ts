export interface TagDictionaryUpdateInput {
  instituteId: string;
  tags: string[];
}

export interface TagDictionaryEntry {
  tagId: string;
  tagName: string;
  usageCount: number;
  path: string;
}

export interface TagDictionaryUpdateResult {
  entries: TagDictionaryEntry[];
}
