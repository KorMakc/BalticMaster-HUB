export interface Article {
  id: number;
  title: string;
  body: string;
  type: string;
  week: number;
  day: string;
  tags: string[];
  keywords: string;
}

export interface PromptItem {
  id: number;
  topic: string;
  chatgpt: string;
  alisa?: string;
  qwen?: string;
}

export interface AIArticle {
  id: string;
  title: string;
  body: string;
  type: string;
  tags: string[];
}

export interface GeneratedArticle {
  id: string;
  title: string;
  body: string;
  topic: string;
  style: string;
  length: string;
  keywords: string;
  wishes: string;
  timestamp: string;
}
