import { redactSensitiveText } from '../../shared/redaction';

export interface OpenApiOperationItem {
  method: string;
  path: string;
  summary: string;
  operationId: string;
  responseCodes: string[];
  secured: boolean;
}

export interface OpenApiValidationReport {
  valid: boolean;
  specVersion: string;
  title: string;
  apiVersion: string;
  endpointCount: number;
  operations: OpenApiOperationItem[];
  diagnostics: { severity: 'error' | 'warning' | 'info'; message: string }[];
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

export function validateOpenApiSpec(rawText: string): OpenApiValidationReport {
  const diagnostics: OpenApiValidationReport['diagnostics'] = [];
  const operations: OpenApiOperationItem[] = [];

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(rawText) as Record<string, unknown>;
  } catch (err) {
    return {
      valid: false,
      specVersion: 'unknown',
      title: 'Invalid JSON',
      apiVersion: '0.0.0',
      endpointCount: 0,
      operations: [],
      diagnostics: [
        {
          severity: 'error',
          message: `OpenAPI JSON syntax error: ${(err as Error).message}`,
        },
      ],
    };
  }

  const specVersion = String(doc.openapi || doc.swagger || '');
  if (!/^3\.(0|1)\.\d+/.test(specVersion)) {
    diagnostics.push({
      severity: 'error',
      message: `Expected OpenAPI 3.0.x or 3.1.x \`openapi\` field, found "${specVersion || '(missing)'}".`,
    });
  }

  const info = (doc.info as Record<string, unknown>) || {};
  const title = String(info.title || '').trim();
  const apiVersion = String(info.version || '').trim();

  if (!title) {
    diagnostics.push({ severity: 'error', message: 'Missing required `info.title` field.' });
  }
  if (!apiVersion) {
    diagnostics.push({ severity: 'error', message: 'Missing required `info.version` field.' });
  }

  const globalSecured = Array.isArray(doc.security) && doc.security.length > 0;
  const pathsObj = (doc.paths as Record<string, Record<string, unknown>>) || {};
  const pathKeys = Object.keys(pathsObj);
  if (pathKeys.length === 0) {
    diagnostics.push({
      severity: 'warning',
      message: 'Spec contains zero `paths` entries.',
    });
  }

  for (const [routePath, methodsMap] of Object.entries(pathsObj)) {
    if (!routePath.startsWith('/')) {
      diagnostics.push({
        severity: 'error',
        message: `Path "${routePath}" must begin with a leading forward slash ("/").`,
      });
    }
    if (!methodsMap || typeof methodsMap !== 'object') continue;

    for (const method of HTTP_METHODS) {
      const op = methodsMap[method] as Record<string, unknown> | undefined;
      if (!op || typeof op !== 'object') continue;

      const summary = String(op.summary || op.description || '').trim();
      const operationId = String(op.operationId || '').trim();
      const responses =
        op.responses && typeof op.responses === 'object'
          ? Object.keys(op.responses as Record<string, unknown>)
          : [];
      const secured =
        globalSecured || (Array.isArray(op.security) && op.security.length > 0);

      if (!summary) {
        diagnostics.push({
          severity: 'warning',
          message: `${method.toUpperCase()} ${routePath}: missing \`summary\` description.`,
        });
      }
      if (responses.length === 0) {
        diagnostics.push({
          severity: 'warning',
          message: `${method.toUpperCase()} ${routePath}: no \`responses\` codes declared (add 200/4xx).`,
        });
      }

      operations.push({
        method: method.toUpperCase(),
        path: routePath,
        summary: summary || '(no summary)',
        operationId: operationId || `${method}_${routePath.replace(/[^A-Za-z0-9]/g, '_')}`,
        responseCodes: responses,
        secured,
      });
    }
  }

  const hasError = diagnostics.some((d) => d.severity === 'error');
  if (!hasError) {
    diagnostics.push({
      severity: 'info',
      message: `Validated OpenAPI ${specVersion} contract (${operations.length} operation(s) across ${pathKeys.length} path(s)).`,
    });
  }

  return {
    valid: !hasError,
    specVersion: specVersion || 'unknown',
    title: title || 'Untitled API',
    apiVersion: apiVersion || '0.0.0',
    endpointCount: operations.length,
    operations,
    diagnostics,
  };
}

export interface ComposeServiceSummary {
  name: string;
  image: string;
  ports: string[];
  hasHealthcheck: boolean;
}

export interface ComposeValidationReport {
  valid: boolean;
  serviceCount: number;
  services: ComposeServiceSummary[];
  diagnostics: { severity: 'error' | 'warning' | 'info'; message: string }[];
}

export function validateComposeSpec(rawYaml: string): ComposeValidationReport {
  const diagnostics: ComposeValidationReport['diagnostics'] = [];
  const services: ComposeServiceSummary[] = [];

  const lines = rawYaml.split(/\r?\n/);
  const servicesIdx = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (servicesIdx === -1) {
    return {
      valid: false,
      serviceCount: 0,
      services: [],
      diagnostics: [
        {
          severity: 'error',
          message: 'Missing top-level `services:` mapping in Compose YAML.',
        },
      ],
    };
  }

  let current: ComposeServiceSummary | null = null;
  let inPorts = false;
  let inEnv = false;

  for (let i = servicesIdx + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;

    // Top-level key ends `services:` block
    if (/^[A-Za-z0-9_-]+:\s*/.test(rawLine)) break;

    const svcMatch = rawLine.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
    if (svcMatch) {
      if (current) services.push(current);
      current = { name: svcMatch[1], image: '', ports: [], hasHealthcheck: false };
      inPorts = false;
      inEnv = false;
      continue;
    }

    if (!current) continue;

    const propMatch = rawLine.match(/^ {4}([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (propMatch) {
      const [, key, val] = propMatch;
      inPorts = key === 'ports';
      inEnv = key === 'environment';
      if (key === 'image') {
        current.image = val.replace(/^["']|["']$/g, '').trim();
      } else if (key === 'build' && !current.image) {
        current.image = 'build:' + (val.trim() || './');
      } else if (key === 'healthcheck') {
        current.hasHealthcheck = true;
      }
      continue;
    }

    if (inPorts) {
      const portItem = rawLine.match(/^\s*-\s*["']?([^"'\s#]+)["']?/);
      if (portItem) {
        current.ports.push(portItem[1]);
      }
    } else if (inEnv) {
      const envKv = rawLine.match(/^\s*(?:-\s*)?([A-Za-z0-9_]+)\s*[:=]\s*(.+)$/);
      if (envKv) {
        const [, envKey, envVal] = envKv;
        const cleaned = envVal.replace(/^["']|["']$/g, '').trim();
        if (
          /(PASSWORD|SECRET|API_KEY|TOKEN)/i.test(envKey) &&
          cleaned.length > 0 &&
          !cleaned.startsWith('${')
        ) {
          diagnostics.push({
            severity: 'warning',
            message: `Service "${current.name}": environment key \`${envKey}\` contains an inline value (${redactSensitiveText(cleaned)}); prefer \`.env\` \`\${${envKey}}\` interpolation.`,
          });
        }
      }
    }
  }
  if (current) services.push(current);

  if (services.length === 0) {
    diagnostics.push({
      severity: 'error',
      message: 'No service definitions found under `services:`.',
    });
  }

  for (const svc of services) {
    if (!svc.image) {
      diagnostics.push({
        severity: 'error',
        message: `Service "${svc.name}" is missing both \`image:\` and \`build:\`.`,
      });
    } else if (svc.image.endsWith(':latest') || (!svc.image.includes(':') && !svc.image.startsWith('build:'))) {
      diagnostics.push({
        severity: 'warning',
        message: `Service "${svc.name}" uses unpinned image tag "${svc.image}" — pin an explicit version/digest for reproducible Windows WSL2/Podman builds.`,
      });
    }

    for (const p of svc.ports) {
      const segments = p.split(':');
      if (segments.length === 2 || p.startsWith('0.0.0.0:')) {
        diagnostics.push({
          severity: 'info',
          message: `Service "${svc.name}" binds port "${p}" on all interfaces — bind \`127.0.0.1:${segments.slice(-2).join(':')}\` for local-only Windows workstation databases.`,
        });
      }
    }

    if (!svc.hasHealthcheck) {
      diagnostics.push({
        severity: 'info',
        message: `Service "${svc.name}": consider adding \`healthcheck:\` so \`depends_on: condition: service_healthy\` waits reliably.`,
      });
    }
  }

  return {
    valid: !diagnostics.some((d) => d.severity === 'error'),
    serviceCount: services.length,
    services,
    diagnostics,
  };
}
