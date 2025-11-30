import { createTheme } from '@mui/material/styles';

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    },
    primary: {
      main: '#1976d2'
    }
  },
  shape: {
    borderRadius: 12
  }
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0e1117',
      paper: '#151924'
    },
    primary: {
      main: '#90caf9'
    }
  },
  shape: {
    borderRadius: 12
  }
});
