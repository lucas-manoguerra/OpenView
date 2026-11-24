import type { MarketDataStreamState, MarketDataSubscription } from './contracts';

export type MarketDataWebSocketConnection = EventTarget &
  Readonly<{
    close: (code?: number, reason?: string) => void;
    send?: (payload: string) => void;
  }>;

export type MarketDataWebSocketFactory = (url: string) => MarketDataWebSocketConnection;

export type ReconnectingWebSocketOptions = Readonly<{
  url: string;
  webSocketFactory: MarketDataWebSocketFactory;
  reconnectDelayMs: number;
  maxReconnectDelayMs: number;
  heartbeatIntervalMs?: number;
  heartbeatMessage?: string;
  heartbeatOnIdle?: boolean;
  heartbeatResponse?: string;
  heartbeatResponseTimeoutMs?: number;
  onOpen?: (connection: MarketDataWebSocketConnection) => void;
  onMessage: (message: string, connection: MarketDataWebSocketConnection) => void;
  onStatus?: (state: MarketDataStreamState) => void;
  onError?: (error: Error) => void;
}>;

export const createReconnectingWebSocketSubscription = (
  options: ReconnectingWebSocketOptions,
): MarketDataSubscription => {
  let active = true;
  let reconnectAttempt = 0;
  let socket: MarketDataWebSocketConnection | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatResponseTimer: ReturnType<typeof setTimeout> | null = null;

  const emitError = (cause: unknown): void => {
    options.onError?.(
      cause instanceof Error ? cause : new Error('The market data WebSocket failed unexpectedly.'),
    );
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearHeartbeatTimer = (): void => {
    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }

    if (heartbeatResponseTimer !== null) {
      clearTimeout(heartbeatResponseTimer);
      heartbeatResponseTimer = null;
    }
  };

  const scheduleReconnect = (): void => {
    if (!active || reconnectTimer !== null) {
      return;
    }

    reconnectAttempt += 1;
    options.onStatus?.('reconnecting');
    const exponent = Math.min(reconnectAttempt - 1, 20);
    const delay = Math.min(options.maxReconnectDelayMs, options.reconnectDelayMs * 2 ** exponent);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const scheduleHeartbeat = (connection: MarketDataWebSocketConnection): void => {
    if (
      options.heartbeatIntervalMs === undefined ||
      !active ||
      socket !== connection ||
      heartbeatResponseTimer !== null
    ) {
      return;
    }

    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
    }

    heartbeatTimer = setTimeout(() => {
      heartbeatTimer = null;

      if (!active || socket !== connection) {
        return;
      }

      if (connection.send === undefined) {
        emitError(
          new Error('The WebSocket connection does not support outgoing heartbeat messages.'),
        );
        connection.close();
        return;
      }

      try {
        connection.send(options.heartbeatMessage ?? JSON.stringify({ op: 'ping' }));
      } catch (cause) {
        emitError(cause);
        connection.close();
        return;
      }

      if (options.heartbeatResponse !== undefined) {
        heartbeatResponseTimer = setTimeout(() => {
          heartbeatResponseTimer = null;
          emitError(new Error('The market data WebSocket heartbeat response timed out.'));
          connection.close();
        }, options.heartbeatResponseTimeoutMs ?? options.heartbeatIntervalMs);
      }

      if (options.heartbeatOnIdle !== true) {
        scheduleHeartbeat(connection);
      }
    }, options.heartbeatIntervalMs);
  };

  const startHeartbeat = (connection: MarketDataWebSocketConnection): void => {
    clearHeartbeatTimer();
    scheduleHeartbeat(connection);
  };
  const connect = (): void => {
    if (!active) {
      return;
    }

    if (reconnectAttempt === 0) {
      options.onStatus?.('connecting');
    }

    let connection: MarketDataWebSocketConnection;

    try {
      connection = options.webSocketFactory(options.url);
    } catch (cause) {
      emitError(cause);
      scheduleReconnect();
      return;
    }

    socket = connection;

    const handleOpen = (): void => {
      if (!active || socket !== connection) {
        return;
      }

      reconnectAttempt = 0;

      try {
        options.onOpen?.(connection);
        startHeartbeat(connection);
        options.onStatus?.('connected');
      } catch (cause) {
        emitError(cause);
        connection.close();
      }
    };

    const handleMessage = (event: Event): void => {
      if (!active || socket !== connection) {
        return;
      }

      const messageData = Reflect.get(event, 'data');

      if (typeof messageData !== 'string') {
        emitError(
          new RangeError('The market data WebSocket returned a message without text data.'),
        );
        return;
      }

      if (options.heartbeatResponse !== undefined && messageData === options.heartbeatResponse) {
        if (heartbeatResponseTimer !== null) {
          clearTimeout(heartbeatResponseTimer);
          heartbeatResponseTimer = null;
        }

        scheduleHeartbeat(connection);
        return;
      }

      if (options.heartbeatOnIdle === true && heartbeatResponseTimer === null) {
        scheduleHeartbeat(connection);
      }

      try {
        options.onMessage(messageData, connection);
      } catch (cause) {
        emitError(cause);
      }
    };

    const handleError = (): void => {
      if (!active || socket !== connection) {
        return;
      }

      emitError(new Error('The market data WebSocket connection reported an error.'));
      connection.close();
    };

    const handleClose = (): void => {
      if (socket !== connection) {
        return;
      }

      socket = null;
      clearHeartbeatTimer();

      if (active) {
        scheduleReconnect();
      }
    };

    connection.addEventListener('open', handleOpen);
    connection.addEventListener('message', handleMessage);
    connection.addEventListener('error', handleError);
    connection.addEventListener('close', handleClose);
  };

  connect();

  return Object.freeze({
    unsubscribe: (): void => {
      if (!active) {
        return;
      }

      active = false;
      clearReconnectTimer();
      clearHeartbeatTimer();
      const currentSocket = socket;
      socket = null;

      if (currentSocket !== null) {
        currentSocket.close(1000, 'Subscription closed');
      }

      options.onStatus?.('disconnected');
    },
  });
};
