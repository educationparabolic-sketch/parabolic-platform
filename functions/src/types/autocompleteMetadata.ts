import {SearchActorRole} from "./searchArchitecture";

export interface AutocompleteMetadataRequest {
  actorRole: SearchActorRole;
  instituteId: string;
  limit?: number;
  query: string;
}

export type TagAutocompleteRequest = AutocompleteMetadataRequest;

export interface ChapterAutocompleteRequest
  extends AutocompleteMetadataRequest {
  subject?: string;
}

export interface TagAutocompleteSuggestion {
  path: string;
  tagId: string;
  tagName: string;
  usageCount: number;
}

export interface ChapterAutocompleteSuggestion {
  chapterId: string;
  chapterName: string;
  path: string;
  subject: string;
  usageCount: number;
}

export interface TagAutocompleteResult {
  suggestions: TagAutocompleteSuggestion[];
}

export interface ChapterAutocompleteResult {
  suggestions: ChapterAutocompleteSuggestion[];
}
