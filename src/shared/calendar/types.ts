export type CalendarEvent = {
  uid: string;
  sequence: number;
  summary: string;
  description: string;
  location: string | null;
  url: string;
  startUtc: Date;
  durationMinutes: number;
  alarmMinutes: number;
};
