const MANAGED_BACKUP_PATTERN = /^postgres-.+\.(dump|sql)(\.gz)?$/;

export function isManagedBackupFile(fileName = '') {
  return MANAGED_BACKUP_PATTERN.test(String(fileName || ''));
}

export function trialDeletionCutoff(now = new Date(), graceDays = 14) {
  const days = Math.max(1, Number.parseInt(graceDays, 10) || 14);
  return new Date(new Date(now).getTime() - days * 86400000);
}
