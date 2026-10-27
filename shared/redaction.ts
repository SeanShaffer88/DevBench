export interface SecretRule {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium';
  pattern: RegExp;
}

export const SECRET_RULES: SecretRule[] = [
  {
    id: 'SEC-AWS-KEY',
    name: 'AWS Access Key ID',
    severity: 'critical',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
  },
  {
    id: 'SEC-GITHUB-PAT',
    name: 'GitHub Personal Access Token',
    severity: 'critical',
    pattern: /\b(gh[pousr]_[A-Za-z0-9_]{24,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
  },
  {
    id: 'SEC-PRIVATE-KEY',
    name: 'PEM / SSH Private Key Header',
    severity: 'critical',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'SEC-CONN-STRING',
    name: 'Database / Cloud Connection String Password',
    severity: 'high',
    pattern: /(?:Password|Pwd|AccountKey|SharedAccessKey)\s*=\s*([^;\s"'`]{6,})/gi,
  },
  {
    id: 'SEC-BEARER-JWT',
    name: 'Embedded JWT Token',
    severity: 'medium',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: 'SEC-GENERIC-ASSIGN',
    name: 'Hardcoded Secret / API Key Assignment',
    severity: 'high',
    pattern: /\b(?:api[_-]?key|client[_-]?secret|auth[_-]?token|secret[_-]?key)\s*[:=]\s*["'`]([A-Za-z0-9_\-/.+=]{16,})["'`]/gi,
  },
];

export function maskToken(value: string): string {
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}••••[REDACTED]••••${value.slice(-2)}`;
}

/**
 * Redacts credentials, tokens, private keys, and optionally personal user directory paths
 * before copying logs, exporting diagnostic bundles, or displaying command output.
 */
export function redactSensitiveText(input: string, redactPersonalPaths = false): string {
  if (!input) return input;
  let out = input;

  // Mask PEM blocks completely
  out = out.replace(
    /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
    '-----BEGIN $1-----\n[REDACTED PRIVATE KEY MATERIAL]\n-----END $1-----'
  );

  for (const rule of SECRET_RULES) {
    const clone = new RegExp(rule.pattern.source, rule.pattern.flags);
    out = out.replace(clone, (fullMatch, group1) => {
      if (typeof group1 === 'string' && group1.length >= 6 && fullMatch !== group1) {
        return fullMatch.replace(group1, maskToken(group1));
      }
      return `[REDACTED:${rule.id}]`;
    });
  }

  // Mask Authorization Bearer headers
  out = out.replace(/(Authorization\s*:\s*Bearer\s+)([^\s"']+)/gi, '$1[REDACTED_TOKEN]');

  if (redactPersonalPaths) {
    out = out.replace(/([A-Za-z]:\\Users\\)([^\\/\s"']+)/g, '$1<REDACTED_USER>');
    out = out.replace(/(\/home\/|\/Users\/)([^/\s"']+)/g, '$1<REDACTED_USER>');
    out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '<REDACTED_EMAIL>');
  }

  return out;
}

export interface LineSecretMatch {
  line: number;
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'medium';
  redactedSnippet: string;
}

export function scanTextForSecrets(content: string): LineSecretMatch[] {
  const findings: LineSecretMatch[] = [];
  const lines = content.split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx++) {
    const lineText = lines[idx];
    if (lineText.length > 2000) continue; // skip minified single-line bundles
    for (const rule of SECRET_RULES) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      if (regex.test(lineText)) {
        findings.push({
          line: idx + 1,
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          redactedSnippet: redactSensitiveText(lineText.trim()).slice(0, 180),
        });
      }
    }
  }

  return findings;
}
