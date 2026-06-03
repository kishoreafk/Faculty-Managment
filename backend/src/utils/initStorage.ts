import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const initializeStorage = async () => {
  const uploadDirs = [
    path.join(__dirname, '../../uploads/vaultify'),
    path.join(__dirname, '../../uploads/timetables'),
    path.join(__dirname, '../../uploads/temp')
  ];

  for (const dir of uploadDirs) {
    try {
      await fsp.mkdir(dir, { recursive: true });
      console.log(`[OK] Created directory: ${dir}`);
    } catch (err: any) {
      console.error(`[DEBUG ERROR] Failed to create upload directory ${dir}: ${err?.message || err}`);
    }
  }

  console.log('[OK] Storage directories initialized');
};
