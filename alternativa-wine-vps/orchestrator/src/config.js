const int = (name, def) => {
  const v = process.env[name];
  const n = v === undefined || v === '' ? def : Number(v);
  if (!Number.isFinite(n)) throw new Error(`Variável ${name} inválida`);
  return n;
};
const str = (name, def) => {
  const v = process.env[name] ?? def;
  if (v === undefined || v === '') throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
};

export function loadConfig(env = process.env) {
  const saved = process.env;
  process.env = env;
  try {
    const dockerUrl = new URL(str('DOCKER_HOST', 'tcp://docker-proxy:2375').replace(/^tcp:/, 'http:'));
    const cfg = {
      port: int('PORT', 8787),
      apiToken: str('ORCH_API_TOKEN'),
      docker: { host: dockerUrl.hostname, port: Number(dockerUrl.port || 2375) },
      image: str('SESSION_IMAGE', 'intel-sim-session:latest'),
      network: str('SESSION_NETWORK', 'sessions_net'),
      simHostPath: str('SIM_HOST_PATH'),
      guacamoleUrl: str('GUACAMOLE_URL', 'http://guacamole:8080').replace(/\/$/, ''),
      guacSecret: str('GUAC_JSON_SECRET'),
      guacdIp: str('GUACD_IP', '172.30.0.2'),
      maxSessions: int('MAX_SESSIONS', 10),
      idleMs: int('IDLE_MINUTES', 10) * 60_000,
      memoryBytes: int('SESSION_MEMORY_MB', 512) * 1024 * 1024,
      nanoCpus: Math.round(int('SESSION_CPUS', 0.75) * 1e9),
      screen: str('SESSION_SCREEN', '1280x720'),
      supabaseUrl: env.SUPABASE_URL || '',
      supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    };
    if (!/^[0-9a-f]{32}$/i.test(cfg.guacSecret)) throw new Error('GUAC_JSON_SECRET deve ter 32 caracteres hexadecimais');
    if (!/^\d{3,4}x\d{3,4}$/.test(cfg.screen)) throw new Error('SESSION_SCREEN inválido (ex.: 1280x720)');
    if (cfg.apiToken.length < 32) throw new Error('ORCH_API_TOKEN deve ter ao menos 32 caracteres');
    return cfg;
  } finally {
    process.env = saved;
  }
}
