import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '../config';
import { useAuth } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import { ChatClient } from '@adieuu/shared';
import './ServiceStatus.scss';

interface ServiceHealth {
  status: 'unknown' | 'checking' | 'online' | 'offline' | 'error';
  latencyMs?: number;
  lastChecked?: Date;
  error?: string;
  details?: Record<string, unknown>;
}

interface ChatServiceHealth extends ServiceHealth {
  connectionState?: string;
  authenticated?: boolean;
}

const POLL_INTERVAL_MS = 5000;

export function ServiceStatus() {
  const navigate = useNavigate();
  const { apiBaseUrl, chatWsUrl } = useAppConfig();
  const { status: authStatus, session } = useAuth();
  const { identity } = useIdentity();

  const [apiHealth, setApiHealth] = useState<ServiceHealth>({ status: 'unknown' });
  const [chatHealth, setChatHealth] = useState<ChatServiceHealth>({ status: 'unknown' });
  const [timeUntilRefresh, setTimeUntilRefresh] = useState(POLL_INTERVAL_MS);

  const chatClientRef = useRef<ChatClient | null>(null);
  const lastRefreshRef = useRef<number>(Date.now());

  const checkApiHealth = useCallback(async () => {
    setApiHealth((prev) => ({ ...prev, status: 'checking' }));

    const start = performance.now();
    try {
      const url = apiBaseUrl ? `${apiBaseUrl}/api/health` : '/api/health';
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      const latencyMs = Math.round(performance.now() - start);

      if (response.ok) {
        const data = await response.json();
        setApiHealth({
          status: 'online',
          latencyMs,
          lastChecked: new Date(),
          details: data,
        });
      } else {
        setApiHealth({
          status: 'error',
          latencyMs,
          lastChecked: new Date(),
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
      }
    } catch (error) {
      const latencyMs = Math.round(performance.now() - start);
      setApiHealth({
        status: 'offline',
        latencyMs,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [apiBaseUrl]);

  const checkChatHealth = useCallback(async () => {
    if (!chatWsUrl) {
      setChatHealth({
        status: 'error',
        lastChecked: new Date(),
        error: 'Chat WebSocket URL not configured',
      });
      return;
    }

    setChatHealth((prev) => ({ ...prev, status: 'checking' }));

    if (chatClientRef.current) {
      chatClientRef.current.disconnect();
    }

    const start = performance.now();

    // If no identity session, check HTTP health endpoint instead of WebSocket
    // (WebSocket requires auth and would fail without identity)
    if (!identity) {
      try {
        const httpUrl = chatWsUrl
          .replace(/^ws:/, 'http:')
          .replace(/^wss:/, 'https:')
          .replace(/\/ws\/chat$/, '/health');
        
        const response = await fetch(httpUrl, {
          method: 'GET',
          credentials: 'include',
        });

        const latencyMs = Math.round(performance.now() - start);

        if (response.ok) {
          setChatHealth({
            status: 'online',
            connectionState: 'n/a',
            latencyMs,
            lastChecked: new Date(),
            authenticated: false,
          });
        } else {
          setChatHealth({
            status: 'error',
            latencyMs,
            lastChecked: new Date(),
            error: `HTTP ${response.status}: ${response.statusText}`,
          });
        }
      } catch (error) {
        const latencyMs = Math.round(performance.now() - start);
        setChatHealth({
          status: 'offline',
          latencyMs,
          lastChecked: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // With identity session, test full WebSocket connection
    try {
      const client = new ChatClient(
        { wsUrl: chatWsUrl, heartbeatInterval: 30000, maxReconnectAttempts: 1 },
        {
          onStateChange: (state) => {
            const latencyMs = Math.round(performance.now() - start);

            if (state === 'connected') {
              setChatHealth({
                status: 'online',
                connectionState: state,
                latencyMs,
                lastChecked: new Date(),
                authenticated: true,
              });
            } else if (state === 'disconnected' || state === 'reconnecting') {
              setChatHealth((prev) => ({
                ...prev,
                connectionState: state,
              }));
            }
          },
          onError: (error) => {
            const latencyMs = Math.round(performance.now() - start);
            const errorMsg = error.message;
            const isAuthError = errorMsg.includes('401') || errorMsg.includes('session') || errorMsg.includes('Unauthorized');

            setChatHealth({
              status: isAuthError ? 'online' : 'offline',
              connectionState: 'disconnected',
              latencyMs,
              lastChecked: new Date(),
              authenticated: false,
              error: errorMsg,
            });
          },
        }
      );

      chatClientRef.current = client;
      client.connect();

      setTimeout(() => {
        if (chatClientRef.current === client && client.getState() === 'connecting') {
          const latencyMs = Math.round(performance.now() - start);
          setChatHealth({
            status: 'offline',
            connectionState: 'timeout',
            latencyMs,
            lastChecked: new Date(),
            error: 'Connection timeout',
          });
          client.disconnect();
        }
      }, 5000);
    } catch (error) {
      const latencyMs = Math.round(performance.now() - start);
      setChatHealth({
        status: 'error',
        latencyMs,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [chatWsUrl, identity]);

  const performRefresh = useCallback(() => {
    lastRefreshRef.current = Date.now();
    setTimeUntilRefresh(POLL_INTERVAL_MS);
    checkApiHealth();
    checkChatHealth();
  }, [checkApiHealth, checkChatHealth]);

  useEffect(() => {
    performRefresh();

    const pollInterval = setInterval(() => {
      performRefresh();
    }, POLL_INTERVAL_MS);

    const timerInterval = setInterval(() => {
      const elapsed = Date.now() - lastRefreshRef.current;
      const remaining = Math.max(0, POLL_INTERVAL_MS - elapsed);
      setTimeUntilRefresh(remaining);
    }, 100);

    return () => {
      clearInterval(pollInterval);
      clearInterval(timerInterval);
      if (chatClientRef.current) {
        chatClientRef.current.disconnect();
        chatClientRef.current = null;
      }
    };
  }, [performRefresh]);

  const formatTime = (date?: Date) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString();
  };

  const getStatusColor = (status: ServiceHealth['status']) => {
    switch (status) {
      case 'online':
        return 'status-online';
      case 'offline':
        return 'status-offline';
      case 'error':
        return 'status-error';
      case 'checking':
        return 'status-checking';
      default:
        return 'status-unknown';
    }
  };

  const getStatusIcon = (status: ServiceHealth['status']) => {
    switch (status) {
      case 'online':
        return '●';
      case 'offline':
        return '○';
      case 'error':
        return '!';
      case 'checking':
        return '◌';
      default:
        return '?';
    }
  };

  const refreshProgress = ((POLL_INTERVAL_MS - timeUntilRefresh) / POLL_INTERVAL_MS) * 100;
  const secondsUntilRefresh = Math.ceil(timeUntilRefresh / 1000);

  return (
    <div className="service-status-page">
      <div className="status-header-bar">
        <button
          type="button"
          className="btn btn-back"
          onClick={() => navigate('/')}
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
      </div>

      <h1>Service Status</h1>
      
      <div className="refresh-timer">
        <div className="refresh-timer-bar">
          <div 
            className="refresh-timer-progress" 
            style={{ width: `${refreshProgress}%` }}
          />
        </div>
        <span className="refresh-timer-text">
          Next refresh in {secondsUntilRefresh}s
        </span>
      </div>

      <div className="status-grid">
        <div className="status-card">
          <div className="status-header">
            <h2>API Service</h2>
            <span className={`status-indicator ${getStatusColor(apiHealth.status)}`}>
              {getStatusIcon(apiHealth.status)} {apiHealth.status}
            </span>
          </div>

          <div className="status-details">
            <div className="detail-row">
              <span className="detail-label">URL:</span>
              <span className="detail-value">{apiBaseUrl || '(same-origin)'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Latency:</span>
              <span className="detail-value">
                {apiHealth.latencyMs !== undefined ? `${apiHealth.latencyMs}ms` : '-'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Last Checked:</span>
              <span className="detail-value">{formatTime(apiHealth.lastChecked)}</span>
            </div>
            {apiHealth.error && (
              <div className="detail-row error">
                <span className="detail-label">Error:</span>
                <span className="detail-value">{apiHealth.error}</span>
              </div>
            )}
          </div>

          <div className="auth-status">
            <h3>Authentication</h3>
            {identity ? (
              <>
                <div className="detail-row">
                  <span className="detail-label">Identity Session:</span>
                  <span className="detail-value auth-ok">Authenticated</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Username:</span>
                  <span className="detail-value">@{identity.username}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Display Name:</span>
                  <span className="detail-value">{identity.displayName}</span>
                </div>
              </>
            ) : (
              <>
                <div className="detail-row">
                  <span className="detail-label">User Session:</span>
                  <span className={`detail-value ${authStatus === 'authenticated' ? 'auth-ok' : 'auth-none'}`}>
                    {authStatus === 'loading' ? 'Checking...' : authStatus === 'authenticated' ? 'Authenticated' : 'Not authenticated'}
                  </span>
                </div>
                {session && (
                  <div className="detail-row">
                    <span className="detail-label">Identifier:</span>
                    <span className="detail-value">{session.identifier}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="status-card">
          <div className="status-header">
            <h2>Chat Service</h2>
            <span className={`status-indicator ${getStatusColor(chatHealth.status)}`}>
              {getStatusIcon(chatHealth.status)} {chatHealth.status}
            </span>
          </div>

          <div className="status-details">
            <div className="detail-row">
              <span className="detail-label">URL:</span>
              <span className="detail-value">{chatWsUrl || '(not configured)'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Latency:</span>
              <span className="detail-value">
                {chatHealth.latencyMs !== undefined ? `${chatHealth.latencyMs}ms` : '-'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Last Checked:</span>
              <span className="detail-value">{formatTime(chatHealth.lastChecked)}</span>
            </div>
            {chatHealth.connectionState && (
              <div className="detail-row">
                <span className="detail-label">Connection:</span>
                <span className="detail-value">{chatHealth.connectionState}</span>
              </div>
            )}
            {chatHealth.error && (
              <div className="detail-row error">
                <span className="detail-label">Error:</span>
                <span className="detail-value">{chatHealth.error}</span>
              </div>
            )}
          </div>

          <div className="auth-status">
            <h3>Authentication</h3>
            <div className="detail-row">
              <span className="detail-label">Identity Session:</span>
              <span className={`detail-value ${identity ? 'auth-ok' : 'auth-none'}`}>
                {identity ? 'Authenticated' : 'Not authenticated'}
              </span>
            </div>
            {identity && (
              <>
                <div className="detail-row">
                  <span className="detail-label">Username:</span>
                  <span className="detail-value">@{identity.username}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Display Name:</span>
                  <span className="detail-value">{identity.displayName}</span>
                </div>
              </>
            )}
            {chatHealth.authenticated !== undefined && (
              <div className="detail-row">
                <span className="detail-label">WS Auth:</span>
                <span className={`detail-value ${chatHealth.authenticated ? 'auth-ok' : 'auth-none'}`}>
                  {chatHealth.authenticated ? 'Accepted' : 'Rejected'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="status-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={performRefresh}
        >
          Refresh Now
        </button>
      </div>
    </div>
  );
}
