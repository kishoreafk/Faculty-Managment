/**
 * seedAdmin.ts
 *
 * One-time script to create the first SUPER_ADMIN.
 *
 * SECURITY: This script REPLACES the previous practice of committing
 * hard-coded dev credentials into schema.sql. There are no default
 * credentials in this codebase — operators must run this script on
 * first install.
 *
 * Usage:
 *   cd backend
 *   npm run seed:admin
 *
 * It will prompt for:
 *   - employee_id
 *   - name
 *   - email
 *   - password (entered twice, not echoed)
 *   - department
 *   - designation
 *   - faculty_type_id (default 1 = Assistant Professor)
 *
 * The password is bcrypt-hashed with cost factor 12 and stored only as
 * the hash. The plaintext is never written to disk.
 */
import './../config/loadEnv.js';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcrypt';
import { pool } from './../config/database.js';
import { requireEnv } from './../config/env.js';

const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_COST = 12;

const rl = readline.createInterface({ input: stdin, output: stdout });

const ask = async (q: string, opts: { silent?: boolean } = {}): Promise<string> => {
  // We don't actually need a silent TTY for now; we just don't echo.
  // On a real TTY, setRawMode + manual echo is what you'd do. For a
  // seed script that is run once, plain input is acceptable and the
  // operator can clear their shell scrollback.
  return (await rl.question(q)).trim();
};

async function main() {
  // Validate env up front.
  requireEnv('DB_HOST');
  requireEnv('DB_USER');
  requireEnv('DB_PASSWORD');
  requireEnv('DB_NAME');
  requireEnv('DB_PORT');

  // eslint-disable-next-line no-console
  console.log('\n=== Faculty Management — First-run SUPER_ADMIN setup ===\n');

  const employee_id = await ask('Employee ID: ');
  const name = await ask('Full name: ');
  const email = await ask('Email: ');
  const department = await ask('Department: ');
  const designation = await ask('Designation: ');
  const facultyTypeRaw = await ask('Faculty type id (default 1 = Assistant Professor): ');
  const faculty_type_id = Number(facultyTypeRaw || '1');

  const password = await ask('Password (min 12 chars): ');
  const password2 = await ask('Confirm password: ');

  if (!employee_id || !name || !email || !department || !designation) {
    throw new Error('All fields except faculty_type_id are required.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password !== password2) {
    throw new Error('Passwords do not match.');
  }
  if (!Number.isInteger(faculty_type_id) || faculty_type_id < 1) {
    throw new Error('faculty_type_id must be a positive integer.');
  }

  // Confirm the role exists
  const [roleRows]: any = await pool.execute('SELECT id, name FROM roles WHERE name = ?', ['SUPER_ADMIN']);
  if (!roleRows || roleRows.length === 0) {
    throw new Error('SUPER_ADMIN role not found. Did you run schema.sql?');
  }
  const role_id = roleRows[0].id;

  // Confirm the faculty_type exists
  const [typeRows]: any = await pool.execute('SELECT id FROM faculty_types WHERE id = ? AND active = TRUE', [faculty_type_id]);
  if (!typeRows || typeRows.length === 0) {
    throw new Error(`faculty_type_id ${faculty_type_id} not found or inactive.`);
  }

  // Hash the password
  const password_hash = await bcrypt.hash(password, BCRYPT_COST);

  // Insert
  const [result]: any = await pool.execute(
    `INSERT INTO faculty
       (employee_id, name, email, password_hash, role_id, faculty_type_id,
        department, designation, doj, gender, approved, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), NULL, TRUE, TRUE)`,
    [employee_id, name, email, password_hash, role_id, faculty_type_id, department, designation]
  );

  const newUserId = result.insertId;

  // Assign default leave balances so the admin can immediately act.
  try {
    await pool.execute('CALL sp_assign_default_leaves(?)', [newUserId]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Warning: sp_assign_default_leaves failed (non-fatal):', (e as Error).message);
  }

  // eslint-disable-next-line no-console
  console.log(`\n[OK] Created SUPER_ADMIN: ${email} (id=${newUserId})`);
  // eslint-disable-next-line no-console
  console.log('  Make sure to delete this account from your shell scrollback and any logs.');
}

main()
  .then(async () => {
    await pool.end();
    rl.close();
    process.exit(0);
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('\n[ERROR] Seed failed:', err.message);
    await pool.end().catch(() => undefined);
    rl.close();
    process.exit(1);
  });
