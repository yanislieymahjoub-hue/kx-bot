export const MOD_PERMISSIONS = {
  clear: 8192n, ban: 4n, unban: 4n, kick: 2n, timeout: 1n << 40n,
  untimeout: 1n << 40n, warn: 1n << 40n, unwarn: 1n << 40n,
  historique: 1n << 40n, slowmode: 16n, 'mod-aide': 8192n,
};
export const MOD_COMMAND_NAMES = Object.keys(MOD_PERMISSIONS);
export const MOD_BOT_PERMISSIONS = 2n | 4n | 16n | 1024n | 2048n | 8192n | 16384n | 65536n | (1n << 40n);
export const hasPermission = (value, permission) => {
  const bits = BigInt(value ?? '0');
  return (bits & 8n) !== 0n || (bits & permission) === permission;
};
