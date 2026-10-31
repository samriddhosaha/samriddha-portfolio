// Every public route. '@post' is resolved at runtime to the newest post permalink (ids are random).
export const ROUTES = [
  '/',
  '/work/event-pricing/',
  '/work/ola-cancellations/',
  '/work/data-warehouse/',
  '/work/job-market/',
  '/feed/',
  '/feed/?tab=posts',
  '/feed/?tab=stories',
  '/feed/?tab=newsletter',
  '/feed/?tab=journey',
  '/feed/newsletter/why-i-label-synthetic-data/',
  '@post',
  '/feed/notice/?m=check',
  '/admin/',
];
export const NOT_FOUND = '/this-page-does-not-exist/';
export const VIEWPORTS = [
  [320, 568], [375, 667], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080],
] as const;
export const PAGES = ROUTES.filter((r) => !r.startsWith('@'));
