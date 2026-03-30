type NodeEnv = 'production' | 'development' | 'test' | string;

import type { SignOptions } from 'jsonwebtoken';

export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Strict Config Error: Missing required environment variable: ${name}`);
  }
  return value;
};

const NODE_ENV: NodeEnv = process.env.NODE_ENV || 'development';
export const isProduction = NODE_ENV === 'production';

export type JwtConfig = {
  secret: string;
  refreshSecret: string;
  expiresIn: NonNullable<SignOptions['expiresIn']>;
  refreshExpiresIn: NonNullable<SignOptions['expiresIn']>;
  algorithm: 'HS256';
};

export const getJwtConfig = (): JwtConfig => {
  return {
    secret: requireEnv('JWT_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    expiresIn: requireEnv('JWT_EXPIRES_IN') as NonNullable<SignOptions['expiresIn']>,
    refreshExpiresIn: requireEnv('JWT_REFRESH_EXPIRES_IN') as NonNullable<SignOptions['expiresIn']>,
    algorithm: 'HS256'
  };
};

export const validateEnvOnBoot = () => {
  // Fail fast immediately on boot if any of these are missing
  requireEnv('DB_HOST');
  requireEnv('DB_USER');
  requireEnv('DB_PASSWORD');
  requireEnv('DB_NAME');
  requireEnv('DB_PORT');
  requireEnv('PORT');
  getJwtConfig();
};

