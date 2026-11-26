import crypto from 'node:crypto';

/**
 * Formato exigido pela extensão guacamole-auth-json:
 * base64( AES-128-CBC(IV=0, key) ( HMAC-SHA256(key, json) || json ) )
 */
export function signAndEncrypt(payload, secretHex) {
  const key = Buffer.from(secretHex, 'hex');
  if (key.length !== 16) throw new Error('A chave JSON do Guacamole deve ter 128 bits (32 hex)');
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.createHmac('sha256', key).update(json).digest();
  const cipher = crypto.createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0));
  return Buffer.concat([cipher.update(Buffer.concat([signature, json])), cipher.final()]).toString('base64');
}

/** Inverso (usado apenas nos testes). */
export function decryptAndVerify(b64, secretHex) {
  const key = Buffer.from(secretHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0));
  const plain = Buffer.concat([decipher.update(Buffer.from(b64, 'base64')), decipher.final()]);
  const sig = plain.subarray(0, 32);
  const json = plain.subarray(32);
  const expected = crypto.createHmac('sha256', key).update(json).digest();
  if (!crypto.timingSafeEqual(sig, expected)) throw new Error('Assinatura inválida');
  return JSON.parse(json.toString('utf8'));
}

export const CONNECTION_NAME = 'sim';

/** Payload com UMA única conexão VNC para o container do estudante, com validade limitada. */
export function buildPayload({ userId, containerName, vncPassword, expiresAtMs }) {
  return {
    username: `u-${userId}`,
    expires: expiresAtMs,
    connections: {
      [CONNECTION_NAME]: {
        protocol: 'vnc',
        parameters: {
          hostname: containerName,
          port: '5900',
          password: vncPassword,
          cursor: 'remote',
          'read-only': 'false',
          'clipboard-encoding': 'UTF-8',
          'enable-sftp': 'false',
        },
      },
    },
  };
}

/** Identificador do cliente na URL do Guacamole: base64("<conexão>\0c\0json"). */
export function clientId(connectionName = CONNECTION_NAME) {
  return Buffer.from([connectionName, 'c', 'json'].join('\0'), 'utf8').toString('base64');
}

/** Troca o payload cifrado por um authToken do Guacamole (chamada servidor-a-servidor). */
export async function requestAuthToken(guacamoleUrl, payload, secretHex, fetchImpl = fetch) {
  const data = signAndEncrypt(payload, secretHex);
  const res = await fetchImpl(`${guacamoleUrl}/api/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Guacamole recusou o token (HTTP ${res.status})`);
  const body = await res.json();
  if (!body.authToken) throw new Error('Resposta do Guacamole sem authToken');
  return body.authToken;
}
