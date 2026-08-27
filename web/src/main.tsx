import '@fontsource-variable/manrope';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { App } from './App.js';
import { ClassifiedListingsSearchPage } from './ClassifiedListingsSearchPage.js';
import { ListingsPage } from './ListingsPage.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/buscar-anuncios" element={<ClassifiedListingsSearchPage />} />
        <Route path="/anuncios" element={<ListingsPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
