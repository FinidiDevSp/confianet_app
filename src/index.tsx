import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import rootReducer from "./slices";

const store = configureStore({ reducer: rootReducer, devTools: true });

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Resolve a safe basename for BrowserRouter in dev when PUBLIC_URL doesn't match current path
const resolveBasename = (): string => {
  const raw = (process.env.PUBLIC_URL || "/") as string;
  const envBase = raw.endsWith("/") && raw !== "/" ? raw.slice(0, -1) : raw; // trim trailing slash except root
  try {
    const current = window.location.pathname;
    if (envBase && envBase !== "/" && !current.startsWith(envBase)) {
      return "/";
    }
  } catch {
    // ignore if window is not defined
  }
  return envBase || "/";
};
root.render(
  <Provider store={store}>
    <React.Fragment>
      <BrowserRouter basename={resolveBasename()}>
        <App />
      </BrowserRouter>
    </React.Fragment>
  </Provider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
