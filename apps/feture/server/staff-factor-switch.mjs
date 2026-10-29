// @ts-check
/** The test-only switch «2FA для сотрудников» (owner 29.10.2026, docs/infra/security.md; table
 * `feture.staff_factor_change`, migration 20261029220000). ON (default): the staff second factor is required exactly
 * as server/commands/staff.mjs says. OFF: the staff requirement is waived (enrolment, the 12 h window, the fresh
 * code, the sign-in step of a staff account); secrets are kept and a regular user's optional factor is untouched.
 * Set only through the admin key (`feture.platform.staffFactor`, lib/feture/staff-factor-admin.js).
 * @typedef {import('./db.mjs').Q} Q */

/** Is the staff factor required? Any failure to read it counts as «yes» (fail closed). @param {Q} q */
export async function staffFactorRequired(q) {
  try {
    const [r] = await q.query('select feture.staff_factor_required() required');
    return r?.required !== false;
  } catch { return true; }
}

/** Current value and who/when changed it last. @param {Q} q */
export async function staffFactorState(q) {
  const [r] = await q.query('select required, changed_by, changed_at from feture.staff_factor_change order by id desc limit 1');
  return { required: r ? !!r.required : true, changedBy: r?.changed_by ?? null, changedAt: r?.changed_at ? new Date(r.changed_at).toISOString() : null };
}

/** @param {Q} q @param {boolean} required @param {string} [by] */
export async function setStaffFactor(q, required, by = 'admin') {
  await q.query('insert into feture.staff_factor_change (required, changed_by) values ($1, $2)', [required, by]);
  return staffFactorState(q);
}
