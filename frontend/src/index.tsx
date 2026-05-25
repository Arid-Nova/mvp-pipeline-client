import './index.css';
import App from './App';
import React from 'react';
import ReactDOM from 'react-dom/client';
import reportWebVitals from './reportWebVitals';
import { setupAxios, setupLogger } from "./utils/axiosSetup";
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

setupLogger();
setupAxios();

// Single QueryClient for the whole app. Cards opt into caching/refetch via
// useQuery / useInfiniteQuery; networkMode 'always' so failed fetches still
// surface errors when the dev backend is briefly down.
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60_000,        // 1m: repo metadata rarely changes mid-session
            gcTime: 5 * 60_000,        // 5m
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);
root.render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals((onPerfEntry : any) =>{});
