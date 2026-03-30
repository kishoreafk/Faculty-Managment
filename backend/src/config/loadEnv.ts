import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single source of truth for the .env file path: repository root
export const rootEnvPath = path.resolve(__dirname, '../../../.env');

// Check if the .env file exists and immediately load variables when this file is imported
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
  console.log(`[ENV] Loaded environment variables from ${rootEnvPath}`);
} else {
  console.warn(`[ENV WARNING] .env file not found at ${rootEnvPath}. Falling back to system environment variables.`);
}

