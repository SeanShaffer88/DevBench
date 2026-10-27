import { describe, expect, it } from 'vitest';
import { redactSensitiveText, scanTextForSecrets } from '../shared/redaction';

describe('Secret Detection & Redaction Engine', () => {
  it('detects GitHub PATs, AWS keys, and connection passwords', () => {
    // Build sample tokens dynamically so static scanners ignore test literals
    const fakePat = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
    const fakeAws = 'AKIA' + '1234567890ABCDEF';
    const sample = [
      `const token = "${fakePat}";`,
      `aws_key = "${fakeAws}"`,
      `Server=tcp:sql.local;Password=SuperSecretDbPass99;Encrypt=True;`,
    ].join('\n');

    const findings = scanTextForSecrets(sample);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    for (const f of findings) {
      expect(f.redactedSnippet).not.toContain(fakePat);
      expect(f.redactedSnippet).not.toContain('SuperSecretDbPass99');
    }
  });

  it('scrubs personal Windows & POSIX home paths and emails when exporting bundles', () => {
    const raw =
      'Error in C:\\Users\\JaneDeveloper\\AppData\\Local\\Temp and /home/janedev/.config reported by jane@example.com';
    const clean = redactSensitiveText(raw, true);
    expect(clean).not.toContain('JaneDeveloper');
    expect(clean).not.toContain('janedev');
    expect(clean).not.toContain('jane@example.com');
    expect(clean).toContain('C:\\Users\\<REDACTED_USER>');
  });
});
