import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './EventDirectory.jsx'; // This path MUST match the filename in the same folder (src/)

// This is the file that sets up React and mounts your application component
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
