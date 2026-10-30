export interface ApiTransport {
  call: <T>(command: string, args?: Record<string, unknown>) => Promise<Awaited<T>>;
}

export interface TransportStats {
  command: string;
  invokes: number;
  bodyBytes: number;
}
