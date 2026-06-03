import { trySendMail } from './mailer.js';

type UserInfo = {
  name?: string | null;
  email: string;
};

export const sendAccountApprovedEmail = async (user: UserInfo): Promise<void> => {
  if (!user.email) return;
  const subject = 'Your Faculty Portal account has been approved';
  const text =
    `Hello ${user.name || ''},\n\n` +
    `Your account has been approved by an administrator. You can now log in to the Faculty Portal.\n\n` +
    `Regards,\nFaculty Portal`;
  await trySendMail({ to: user.email, subject, text });
};

export const sendAccountCreatedEmail = async (user: UserInfo, extra?: { department?: string; designation?: string; password?: string }): Promise<void> => {
  if (!user.email) return;
  const subject = 'Your Faculty Portal account has been created';
  const lines = [`Hello ${user.name || ''},\n\n`];
  lines.push(`An administrator has created your Faculty Portal account.\n\n`);
  lines.push(`Email: ${user.email}\n`);
  if (extra?.department) lines.push(`Department: ${extra.department}\n`);
  if (extra?.designation) lines.push(`Designation: ${extra.designation}\n`);
  if (extra?.password) {
    lines.push(`Employee ID: ${(user as any).employee_id || ''}\n`);
    lines.push(`Default Password: ${extra.password}\n\n`);
    lines.push(`Please log in and change your password immediately.\n\n`);
  } else {
    lines.push(`\nIf you were provided a temporary password, please change it immediately after logging in.\n\n`);
  }
  lines.push(`Regards,\nFaculty Portal`);
  await trySendMail({ to: user.email, subject, text: lines.join('') });
};

export const sendLeaveReviewEmail = async (args: {
  email: string;
  name: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  reason: string;
}): Promise<void> => {
  if (!args.email) return;
  const subject = `Leave application ${args.status.toLowerCase()}`;
  const text =
    `Hello ${args.name},\n\n` +
    `Your leave application (${args.leaveType}) from ${args.startDate} to ${args.endDate} has been ${args.status.toLowerCase()}.\n\n` +
    `Reviewer note: ${args.reason}\n\n` +
    `Regards,\nFaculty Portal`;
  await trySendMail({ to: args.email, subject, text });
};

export const sendProductReviewEmail = async (args: {
  email: string;
  name: string;
  itemName: string;
  quantity: number;
  reason: string;
  status: string;
  reviewerNote: string;
}): Promise<void> => {
  if (!args.email) return;
  const subject = `Product request ${args.status.toLowerCase()}`;
  const text =
    `Hello ${args.name},\n\n` +
    `Your product request for "${args.itemName}" (Quantity: ${args.quantity}) has been ${args.status.toLowerCase()}.\n\n` +
    `Request reason: ${args.reason}\n\n` +
    `Reviewer note: ${args.reviewerNote}\n\n` +
    `Regards,\nFaculty Portal`;
  await trySendMail({ to: args.email, subject, text });
};

export const sendBulkImportWelcomeEmail = async (args: {
  email: string;
  name: string;
  employeeId: string;
  defaultPassword: string;
}): Promise<void> => {
  if (!args.email) return;
  const subject = 'Your Faculty Portal account has been created';
  const text =
    `Hello ${args.name},\n\n` +
    `An administrator has created your Faculty Portal account using a bulk import.\n\n` +
    `Email: ${args.email}\n` +
    `Employee ID: ${args.employeeId}\n` +
    `Default Password: ${args.defaultPassword}\n\n` +
    `Please log in and change your password immediately.\n\n` +
    `Regards,\nFaculty Portal`;
  await trySendMail({ to: args.email, subject, text });
};
