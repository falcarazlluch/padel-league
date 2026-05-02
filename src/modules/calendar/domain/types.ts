export type CalendarCategory = 'OWN_LEAGUE' | 'OTHER_LEAGUE_MINE' | 'INDEPENDENT';

export type CalendarItemStatus = 'CONFIRMED' | 'TENTATIVE';

export type CalendarMatch = {
  id: string;
  category: CalendarCategory;
  status: CalendarItemStatus;
  scheduledAt: Date;
  title: string;
  href: string;
};
