export const formatTimeTo12Hour = (time: string): string => {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
};

export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export const formatRowTimes = (row: any): any => {
  if (row.start_time) {
    row.start_time_formatted = formatTimeTo12Hour(row.start_time);
  }
  if (row.end_time) {
    row.end_time_formatted = formatTimeTo12Hour(row.end_time);
  }
  return row;
};

export const formatRowDates = (row: any, dateFields: string[] = []): any => {
  dateFields.forEach(field => {
    if (row[field]) {
      row[field] = formatDate(row[field]);
    }
  });
  return row;
};

export const formatRowDateTimes = (row: any, dateTimeFields: string[] = []): any => {
  dateTimeFields.forEach(field => {
    if (row[field]) {
      row[field] = formatDateTime(row[field]);
    }
  });
  return row;
};
