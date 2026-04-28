/**
 * Joyería Mariné — Sistema de Licencias
 * Serialización por código único por dispositivo
 */

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Ruta donde se guarda la licencia activada
const LICENSE_FILE = path.join(
  process.env.APPDATA || os.homedir(),
  'JoyeriaMarinePOS',
  'license.dat'
);

// Salt secreto — cámbialo antes de distribuir, nunca lo compartas
const SECRET_SALT = 'MARINE_POS_2026_SALT_X9K2';

/**
 * Obtiene un identificador único del hardware del dispositivo.
 * Combina hostname + plataforma + CPUs para generar un ID estable.
 */
function getMachineId() {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';
  const raw = `${os.hostname()}|${os.platform()}|${cpuModel}|${os.arch()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * Genera un código de licencia válido para un machineId dado.
 * Formato: XXXX-XXXX-XXXX-XXXX
 * Úsalo en el generador de licencias (generate-license.js).
 */
function generateLicenseCode(machineId) {
  const payload = `${machineId}|${SECRET_SALT}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').toUpperCase();
  // Tomar 16 caracteres y formatear como XXXX-XXXX-XXXX-XXXX
  const raw = hash.substring(0, 16);
  return `${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}`;
}

/**
 * Valida si un código de licencia es correcto para este dispositivo.
 */
function validateLicenseCode(code) {
  const machineId = getMachineId();
  const expected = generateLicenseCode(machineId);
  // Comparación insensible a mayúsculas/minúsculas y espacios
  const normalizedInput = code.trim().toUpperCase().replace(/\s/g, '');
  const normalizedExpected = expected.toUpperCase().replace(/\s/g, '');
  return normalizedInput === normalizedExpected;
}

/**
 * Guarda la licencia activada en disco (cifrada).
 */
function saveLicense(code, clientName) {
  const dir = path.dirname(LICENSE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const machineId = getMachineId();
  const payload = JSON.stringify({
    code: code.trim().toUpperCase(),
    machineId,
    clientName: clientName || '',
    activatedAt: new Date().toISOString(),
  });

  // Cifrar con AES-256
  const key = crypto.createHash('sha256').update(SECRET_SALT).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const data = iv.toString('hex') + ':' + encrypted.toString('hex');

  fs.writeFileSync(LICENSE_FILE, data, 'utf8');
}

/**
 * Lee y descifra la licencia guardada en disco.
 * Retorna null si no existe o está corrupta.
 */
function readSavedLicense() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null;
    const data = fs.readFileSync(LICENSE_FILE, 'utf8');
    const [ivHex, encryptedHex] = data.split(':');
    const key = crypto.createHash('sha256').update(SECRET_SALT).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Verifica si la app tiene una licencia válida activa.
 * Retorna { valid: bool, reason: string }
 */
function checkLicense() {
  const saved = readSavedLicense();
  if (!saved) {
    return { valid: false, reason: 'no_license' };
  }

  const machineId = getMachineId();

  // Verificar que la licencia es para este dispositivo
  if (saved.machineId !== machineId) {
    return { valid: false, reason: 'wrong_machine' };
  }

  // Verificar que el código sigue siendo válido
  if (!validateLicenseCode(saved.code)) {
    return { valid: false, reason: 'invalid_code' };
  }

  return { valid: true, clientName: saved.clientName, activatedAt: saved.activatedAt };
}

module.exports = {
  getMachineId,
  generateLicenseCode,
  validateLicenseCode,
  saveLicense,
  checkLicense,
};
