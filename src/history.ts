export type IdeaHistoryItem = {
  text: string;
  category: string;
  timestamp: number;
  pinned?: boolean;
};

const STORAGE_KEY = 'ideaspark_history';

const getStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
};

const sortHistory = (items: IdeaHistoryItem[]) =>
  [...items].sort((a, b) => {
    if (a.pinned === b.pinned) {
      return b.timestamp - a.timestamp;
    }
    return a.pinned ? -1 : 1;
  });

export function loadIdeaHistory(): IdeaHistoryItem[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .map((item) => ({
        text: String(item.text || ''),
        category: String(item.category || ''),
        timestamp: Number(item.timestamp || 0),
        pinned: Boolean(item.pinned)
      }))
      .filter((item) => item.text);

    return sortHistory(normalized);
  } catch (error) {
    console.warn('Failed to load idea history', error);
    return [];
  }
}

export function saveIdeaToHistory(text: string, category: string): IdeaHistoryItem[] {
  const trimmedText = text.trim();
  if (!trimmedText) return loadIdeaHistory();

  const storage = getStorage();
  if (!storage) return [];

  const history = loadIdeaHistory();
  const exists = history.some((item) => item.text === trimmedText);
  if (exists) return history;

  const updatedHistory = [
    {
      text: trimmedText,
      category: category.trim() || '未分類',
      timestamp: Date.now(),
      pinned: false
    },
    ...history
  ];

  const sorted = sortHistory(updatedHistory);
  storage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  return sorted;
}

export function clearIdeaHistory(): IdeaHistoryItem[] {
  const storage = getStorage();
  if (!storage) return [];

  storage.removeItem(STORAGE_KEY);
  return [];
}

export function togglePin(text: string): IdeaHistoryItem[] {
  const storage = getStorage();
  if (!storage) return [];

  const history = loadIdeaHistory();
  const updated = history.map((item) =>
    item.text === text ? { ...item, pinned: !item.pinned } : item
  );
  const sorted = sortHistory(updated);

  storage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  return sorted;
}
