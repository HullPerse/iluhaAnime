export interface PageFindMatch {
  node: Text;
  start: number;
  end: number;
}

export interface PageFindCollection {
  matches: PageFindMatch[];
  truncated: boolean;
}

export interface PageFindOptions {
  root?: ParentNode;
  maxNodes?: number;
  maxMatches?: number;
  caseSensitive?: boolean;
  wholeWords?: boolean;
}
