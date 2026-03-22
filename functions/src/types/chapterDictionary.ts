export interface ChapterDictionaryUpdateInput {
  instituteId: string;
  chapterName: string;
  subject: string;
}

export interface ChapterDictionaryEntry {
  chapterId: string;
  chapterName: string;
  subject: string;
  usageCount: number;
  path: string;
}

export interface ChapterDictionaryUpdateResult {
  entry: ChapterDictionaryEntry;
}
