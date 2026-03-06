import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { WebSocketProvider } from './context/WebSocketContext'
import { UnreadProvider } from './context/UnreadContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <WebSocketProvider>
        <UnreadProvider>
          <App />
        </UnreadProvider>
      </WebSocketProvider>
    </AuthProvider>
  </StrictMode>,
)
