import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Demo mode banner
if (String(import.meta.env.VITE_DEMO_MODE || '').toLowerCase() === 'true') {
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#2563eb;color:#fff;text-align:center;font-size:12px;padding:4px;font-family:sans-serif';
  banner.textContent = '⚡ Demo mode — data resets periodically. Not for production use.';
  document.body.appendChild(banner);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
