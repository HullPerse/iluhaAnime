export type NetworkVerdict =
  | "ok"
  | "dns_failed"
  | "tcp_failed"
  | "tls_failed"
  | "http_status"
  | "anti_bot"
  | "request_failed";

interface NetworkDnsAnswer {
  address: string;
  family: "ipv4" | "ipv6";
}

interface NetworkTcpProbe {
  address: string;
  family: "ipv4" | "ipv6";
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

interface NetworkHttpsProbe {
  ok: boolean;
  status: number | null;
  httpVersion: string | null;
  remoteAddress: string | null;
  latencyMs: number;
  challenge: boolean;
  errorStage: string | null;
  error: string | null;
}

export interface NetworkDiagnosis {
  host: string;
  port: number;
  proxy: string | null;
  dns: NetworkDnsAnswer[];
  dnsError: string | null;
  tcp: NetworkTcpProbe[];
  ipv6Reachable: boolean | null;
  https: NetworkHttpsProbe;
  verdict: NetworkVerdict;
}
