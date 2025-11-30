import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Box,
  Typography,
  Select,
  MenuItem,
  CircularProgress,
  Stack,
  IconButton,
  CssBaseline,
  SelectChangeEvent
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { DarkMode, LightMode, PushPin, PushPinOutlined } from '@mui/icons-material';
import { clearIdeaHistory, loadIdeaHistory, saveIdeaToHistory, IdeaHistoryItem, togglePin } from './history';
import { lightTheme, darkTheme } from './theme';
import { canGenerateIdea, recordGenerateIdea } from './rateLimit';
import { getUniqueDeviceId } from './deviceId';
import { useTranslation } from 'react-i18next';
import { saveLanguage } from './i18n';
import { useRef } from 'react';

const categoryKeys = [
  'random',
  'study',
  'hobby',
  'exercise',
  'development',
  'lifestyle',
  'cooking',
  'lifehack',
  'money',
  'health',
  'skill',
  'relationships',
  'creative',
  'content',
  'productivity'
] as const;

function App() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [category, setCategory] = useState<(typeof categoryKeys)[number]>('random');
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<IdeaHistoryItem[]>([]);
  const [canShare, setCanShare] = useState(false);
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState<'ja' | 'en'>(i18n.language === 'en' ? 'en' : 'ja');
  const prevLanguageRef = useRef<'ja' | 'en'>(language);

  useEffect(() => {
    setHistory(loadIdeaHistory());
  }, []);

  useEffect(() => {
    const storedTheme = typeof window !== 'undefined' ? window.localStorage.getItem('ideaspark_theme') : null;
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setThemeMode(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ideaspark_theme', themeMode);
    }
  }, [themeMode]);

  const theme = useMemo(() => (themeMode === 'light' ? lightTheme : darkTheme), [themeMode]);
  useEffect(() => {
    if (language !== i18n.language) {
      i18n.changeLanguage(language);
      saveLanguage(language);
    }
  }, [language, i18n]);

  async function getIdea() {
    const rate = canGenerateIdea();
    if (!rate.allowed) {
      setIdea(`リミットです（あと${rate.remaining}分）`);
      setCanShare(false);
      return;
    }

    setLoading(true);
    setCanShare(false);
    recordGenerateIdea();

    try {
      const deviceId = await getUniqueDeviceId();
      const categoryLabel = t(`categories.${category}`);
      const res = await fetch('/api/idea', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ category: categoryLabel, deviceId, lang: language })
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data?.error === 'rate_limit') {
          const remainingMinutes = typeof data?.remaining === 'number' ? data.remaining : 60;
          setIdea(`リミットです（あと${remainingMinutes}分）`);
          setCanShare(false);
          return;
        }
        setIdea('エラーが発生しました');
        setCanShare(false);
        return;
      }

      const generatedIdea = typeof data.idea === 'string' ? data.idea.trim() : '';
      if (!generatedIdea) {
        setIdea('アイデアが取得できませんでした。');
        setCanShare(false);
        return;
      }

      setIdea(generatedIdea);
      setCanShare(true);

      if (generatedIdea) {
        const updated = saveIdeaToHistory(generatedIdea, categoryLabel);
        setHistory(updated);
      }
    } catch (e) {
      setIdea('エラーが発生しました');
      setCanShare(false);
    } finally {
      setLoading(false);
    }
  }

  const handleClearHistory = () => {
    const cleared = clearIdeaHistory();
    setHistory(cleared);
  };

  const handleTogglePin = (text: string) => {
    const updated = togglePin(text);
    setHistory(updated);
  };

  const translateIdea = async (fromLang: 'ja' | 'en', toLang: 'ja' | 'en') => {
    if (!idea) return;
    setLoading(true);
    setCanShare(false);
    try {
      const deviceId = await getUniqueDeviceId();
      const res = await fetch('/api/idea', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: idea, translateFrom: fromLang, lang: toLang, deviceId })
      });
      const data = await res.json();

      if (!res.ok) {
        setCanShare(false);
        return;
      }

      const translatedIdea = typeof data.idea === 'string' ? data.idea.trim() : '';
      if (!translatedIdea) {
        setCanShare(false);
        return;
      }

      setIdea(translatedIdea);
      setCanShare(true);
    } catch (error) {
      console.warn('Translation failed', error);
      setCanShare(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const prevLang = prevLanguageRef.current;
    if (!idea) {
      prevLanguageRef.current = language;
      return;
    }
    if (language !== prevLang) {
      translateIdea(prevLang, language);
    }
    prevLanguageRef.current = language;
  }, [language, idea]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', justifyContent: 'center', alignItems: 'center', px: 2 }}>
        <Box sx={{ bgcolor: 'background.paper', p: 4, borderRadius: 2, boxShadow: 3, maxWidth: 420, width: '100%', textAlign: 'center', position: 'relative' }}>
          <Box sx={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 1 }}>
            <IconButton
              aria-label={t('themeSwitch')}
              onClick={() => setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'))}
            >
              {themeMode === 'light' ? <DarkMode /> : <LightMode />}
            </IconButton>
            <IconButton
              aria-label="言語切り替え"
              onClick={() => setLanguage((prev) => (prev === 'ja' ? 'en' : 'ja'))}
              sx={{ fontSize: 12, fontWeight: 700 }}
            >
              {language === 'ja' ? 'EN' : 'JA'}
            </IconButton>
          </Box>

          <Typography variant="h4" gutterBottom color="primary">{t('title')}</Typography>

          <Select
            fullWidth
          value={category}
          sx={{ mb: 2 }}
          aria-label={t('category')}
          onChange={(e: SelectChangeEvent<(typeof categoryKeys)[number]>) => setCategory(e.target.value as (typeof categoryKeys)[number])}
        >
            {categoryKeys.map((key) => (
              <MenuItem key={key} value={key}>{t(`categories.${key}`)}</MenuItem>
            ))}
          </Select>

          <Button fullWidth variant="contained" onClick={getIdea} disabled={loading}>{loading ? t('thinking') : t('generate')}</Button>

          <Box sx={{ mt: 4 }}>
            {loading ? (<CircularProgress size={24} />) : (<Typography>{idea || ''}</Typography>)}
          </Box>

          <Box sx={{ mt: 3, marginBottom: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                py: 1.2
              }}
              startIcon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.5 11.24h-6.675l-5.227-6.86-5.977 6.86H1.638l7.73-8.86L1.25 2.25h6.86l4.713 6.237 5.42-6.237zm-1.163 17.52h1.833L7.084 4.39H5.117l11.964 15.38z" />
                </svg>
              }
              onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(idea || "")}&url=${encodeURIComponent("https://ideaspark.audex.dev")}`, "_blank")}
              disabled={!canShare}
            >
              {t('shareX')}
            </Button>
          </Box>

          <Box
            sx={{
              mt: 3,
              textAlign: 'left',
              bgcolor: (theme) => theme.palette.mode === 'light' ? '#f3f4f6' : 'rgba(255,255,255,0.05)',
              borderRadius: '12px',
              p: 2.5,
              boxShadow: (theme) => theme.palette.mode === 'light' ? '0 12px 30px rgba(0,0,0,0.08)' : '0 12px 30px rgba(0,0,0,0.35)',
              border: (theme) => theme.palette.mode === 'light' ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <Typography variant="subtitle1" fontWeight={700} color="text.primary" gutterBottom>
              {t('history')}
            </Typography>

            {history.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('empty')}
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {history.map((item) => (
                  <Box
                    key={`${item.timestamp}-${item.text}`}
                    sx={{
                      bgcolor: (theme) =>
                        item.pinned
                          ? (theme.palette.mode === 'light' ? '#eef2ff' : 'rgba(255,255,255,0.12)')
                          : (theme.palette.mode === 'light' ? '#fff' : 'rgba(255,255,255,0.08)'),
                      borderRadius: 1.5,
                      px: 1.5,
                      py: 1.25,
                      boxShadow: (theme) =>
                        item.pinned
                          ? (theme.palette.mode === 'light' ? '0 0 0 1px rgba(25,118,210,0.25)' : '0 0 0 1px rgba(144,202,249,0.35)')
                          : (theme.palette.mode === 'light' ? 'inset 0 1px 0 rgba(255,255,255,0.9)' : 'inset 0 1px 0 rgba(255,255,255,0.05)'),
                      display: 'flex',
                      gap: 1,
                      alignItems: 'flex-start'
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, lineHeight: 1.4 }}>
                        {item.text}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.category} ・ {new Date(item.timestamp).toLocaleString()}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      aria-label={t('pinned')}
                      onClick={() => handleTogglePin(item.text)}
                      sx={{ color: item.pinned ? 'primary.main' : 'text.secondary', mt: -0.25 }}
                    >
                      {item.pinned ? <PushPin fontSize="small" /> : <PushPinOutlined fontSize="small" />}
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}

            <Button
              fullWidth
              variant="text"
              color="inherit"
              sx={{ mt: 2, textTransform: 'none', fontWeight: 600 }}
              onClick={handleClearHistory}
              disabled={history.length === 0}
            >
              {t('clearHistory')}
            </Button>
          </Box>

          <Typography sx={{ mt: 4 }} variant="caption" color="text.secondary">
            &copy; 2025 IdeaSpark
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
