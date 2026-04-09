import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './hooks/useAuth';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.88rem',
              background: '#FAF7F2',
              color: '#2A1A0E',
              border: '1px solid #E0D5C1',
              borderRadius: '8px',
              boxShadow: '0 2px 16px rgba(61,35,20,0.10)',
            },
            success: { iconTheme: { primary: '#7C8C5E', secondary: '#FAF7F2' } },
            error:   { iconTheme: { primary: '#8C3A3A', secondary: '#FAF7F2' } },
          }}
        />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);