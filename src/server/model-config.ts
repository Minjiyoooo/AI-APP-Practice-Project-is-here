interface ProviderConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`服务端未配置 ${name}，请在项目根目录的 .env.local 或部署环境变量中设置。`);
  }
  return value;
}

function parseApiUrl(value: string, envName: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${envName} 不是有效的接口地址。`);
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHosts.has(url.hostname))) {
    throw new Error(`${envName} 必须使用 HTTPS；仅本机自托管服务允许使用 HTTP。`);
  }
  return url.toString();
}

export function getDeepSeekConfig(): ProviderConfig {
  return {
    apiKey: requiredEnv('DEEPSEEK_API_KEY'),
    apiUrl: parseApiUrl(
      process.env.DEEPSEEK_API_URL?.trim() || 'https://api.deepseek.com/chat/completions',
      'DEEPSEEK_API_URL',
    ),
    model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
  };
}

export function getBgeM3Config(): ProviderConfig {
  return {
    apiKey: requiredEnv('BGE_M3_API_KEY'),
    apiUrl: parseApiUrl(requiredEnv('BGE_M3_API_URL'), 'BGE_M3_API_URL'),
    model: process.env.BGE_M3_MODEL?.trim() || 'BAAI/bge-m3',
  };
}

export async function createProviderError(
  response: Response,
  providerName: string,
): Promise<Error> {
  const raw = (await response.text()).slice(0, 1200);
  let detail = raw;

  try {
    const body: unknown = JSON.parse(raw);
    if (body && typeof body === 'object' && 'error' in body) {
      const error = body.error;
      if (typeof error === 'string') detail = error;
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        detail = error.message;
      }
    } else if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      detail = body.message;
    }
  } catch {
    // 保留服务商返回的纯文本错误，不暴露请求头或密钥。
  }

  return new Error(
    `${providerName} 请求失败（HTTP ${response.status}）${detail ? `：${detail.slice(0, 500)}` : ''}`,
  );
}
