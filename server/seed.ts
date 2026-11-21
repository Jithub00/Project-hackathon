import { addDaysIso, get, newId, nowIso, run, todayIso, type Db } from './db';
import { hashPassword } from './auth';
import { insertUser, getUserRow, type UserRow } from './domain/people';
import {
  acceptedQuoteTotals,
  addDelivery,
  buildDetail,
  confirmCompletion,
  createProject,
  createReview,
  postMessage,
  requireProject,
  sendAgreement,
  setMemberResponse,
  approveVersion,
} from './domain/projects';
import { applySucceeded } from './domain/payments';
import { currentVersions, recordPolicyAcceptance } from './domain/policy';
import type { ProjectCreateInput } from '../shared/schemas';
import { DEMO_PASSWORD_HINT } from '../shared/constants';

/** Shared password for every demonstration account. Shown on the login page. */
export const DEMO_PASSWORD = DEMO_PASSWORD_HINT;

const S = '/images/samples/';
const IMG = {
  downtownNight: `${S}la-01-downtown-la-at-night.jpg`,
  freewayNight: `${S}la-02-freeway-skyline-night.jpg`,
  echoPark: `${S}la-03-echo-park-lake-skyline.jpg`,
  cityHall: `${S}la-04-city-hall-belgian-colours.jpg`,
  griffithDusk: `${S}la-05-griffith-observatory-dusk.jpg`,
  griffithTwilight: `${S}la-06-griffith-observatory-twilight.jpg`,
  disneyHall: `${S}la-07-disney-concert-hall-steel.jpg`,
  capitolRecords: `${S}la-08-capitol-records-sunset.jpg`,
  gettySunset: `${S}la-09-getty-center-sunset.jpg`,
  gettyHaze: `${S}la-10-getty-center-skyline-haze.jpg`,
  wattsTowers: `${S}la-11-watts-towers.jpg`,
  angelsFlight: `${S}la-12-angels-flight.jpg`,
  // la-14 (Santa Monica Pier) is outside the City of Los Angeles, so it is not used.
  hollywoodSign: `${S}la-13-hollywood-sign-overlook.jpg`,
  palmSunset: `${S}la-15-palm-trees-sunset.jpg`,
  hero: `${S}hero-los-angeles.jpg`,
  abstract: (n: number) => `${S}abstract-${String(n).padStart(2, '0')}.jpg`,
};

interface SeedPackage {
  id: string;
  service: 'photography' | 'videography';
  name: string;
  hours: number;
  priceCents: number;
  deliverables: string;
}

interface SeedPortfolio {
  kind: 'photo' | 'video';
  title: string;
  contribution: string;
  media: string;
  projectLabel: string;
}

interface SeedCreator {
  email: string;
  name: string;
  bio: string;
  services: 'photography' | 'videography' | 'both';
  specialties: string[];
  styles: string[];
  neighborhoods: string[];
  citywide: boolean;
  seeking: boolean;
  years: number;
  weekdays: number[];
  hours: string;
  packages: SeedPackage[];
  portfolio: SeedPortfolio[];
  availableDays: number[];
}

const CREATORS: SeedCreator[] = [
  {
    email: 'marisol@example.com',
    name: 'Marisol Vega',
    bio: 'I photograph products, editorial still lifes and downtown Los Angeles architecture. Every brief starts with a shot list, then a light test, then the shoot day. Clients receive a shared folder of retouched selects, a usage note, and a clear delivery date. Most of my work happens in natural light and small studios in the Arts District.',
    services: 'photography',
    specialties: ['Product & e-commerce', 'Editorial', 'Architecture'],
    styles: ['Clean & bright', 'Natural light', 'Editorial'],
    neighborhoods: ['Arts District', 'Downtown LA', 'Chinatown', 'Little Tokyo', 'Boyle Heights'],
    citywide: false,
    seeking: true,
    years: 9,
    weekdays: [1, 2, 3, 4, 5],
    hours: '09:00-18:00',
    packages: [
      { id: 'pkg-marisol-half', service: 'photography', name: 'Product half-day', hours: 4, priceCents: 85000, deliverables: '40 retouched images, web and full resolution' },
      { id: 'pkg-marisol-full', service: 'photography', name: 'Full-day production', hours: 8, priceCents: 160000, deliverables: '90 retouched images and two editorial sets' },
    ],
    portfolio: [
      { kind: 'photo', title: 'Downtown at night', contribution: 'Planned the angles, lit the skyline frames and retouched the final set.', media: IMG.downtownNight, projectLabel: 'Architecture study · Downtown LA' },
      { kind: 'photo', title: 'Angels Flight lift', contribution: 'Shot on location with a two-light setup for the lift and station.', media: IMG.angelsFlight, projectLabel: 'Editorial · Bunker Hill' },
      { kind: 'photo', title: 'Light study, abstract', contribution: 'Product-style lighting study used as a moodboard for the client.', media: IMG.abstract(4), projectLabel: 'Product lighting test' },
      { kind: 'photo', title: 'Capitol Records at sunset', contribution: 'Chose the window, managed the golden hour and delivered retouched selects.', media: IMG.capitolRecords, projectLabel: 'Brand story · Hollywood' },
    ],
    availableDays: [2, 4, 9, 11, 16, 18],
  },
  {
    email: 'devon@example.com',
    name: 'Devon Park',
    bio: 'Brand films, social cut-downs and event recaps. I shoot on location across Los Angeles, edit for vertical and horizontal platforms, and deliver captions on request. My style is documentary with a cinematic grade. I plan the shot list with clients and keep revisions to what was agreed in the brief.',
    services: 'videography',
    specialties: ['Brand films', 'Social cut-downs', 'Event recaps'],
    styles: ['Documentary', 'Moody & cinematic'],
    neighborhoods: [],
    citywide: true,
    seeking: true,
    years: 8,
    weekdays: [1, 2, 3, 4, 5, 6],
    hours: '08:00-19:00',
    packages: [
      { id: 'pkg-devon-social', service: 'videography', name: 'Social cut day', hours: 3, priceCents: 110000, deliverables: 'Two vertical edits (30 seconds) and three thumbnail stills' },
      { id: 'pkg-devon-film', service: 'videography', name: 'Brand film day', hours: 8, priceCents: 240000, deliverables: 'One 60-second hero film and two 15-second social cuts' },
    ],
    portfolio: [
      { kind: 'video', title: 'Showreel: Watts Towers', contribution: 'Directed, shot and edited the 60-second brand film. Preview frame shown.', media: IMG.wattsTowers, projectLabel: 'Brand film · South LA' },
      { kind: 'video', title: 'Palm-lined social cut', contribution: 'Shot handheld on location and cut two vertical edits for launch week.', media: IMG.palmSunset, projectLabel: 'Social cut-downs · Venice' },
      { kind: 'video', title: 'Light-trail sequence', contribution: 'Built the motion sequence and the grade for the event recap.', media: IMG.abstract(7), projectLabel: 'Event recap · Downtown' },
    ],
    availableDays: [3, 5, 10, 12, 19, 24],
  },
  {
    email: 'ava@example.com',
    name: 'Ava Kim',
    bio: 'Architecture and interiors photographer and filmmaker. I make clean, honest images of homes, studios and public buildings across Los Angeles. For real estate clients I deliver a still set and a 60-second walkthrough, planned around the best light and the clients’ timing.',
    services: 'both',
    specialties: ['Architecture', 'Interiors', 'Real estate walkthroughs'],
    styles: ['Architectural', 'Clean & bright', 'Minimal'],
    neighborhoods: ['Silver Lake', 'Los Feliz', 'Echo Park', 'Hollywood', 'Eagle Rock'],
    citywide: false,
    seeking: true,
    years: 11,
    weekdays: [1, 2, 3, 4, 5, 6],
    hours: '08:00-17:00',
    packages: [
      { id: 'pkg-ava-photo', service: 'photography', name: 'Architecture half-day', hours: 4, priceCents: 70000, deliverables: '35 images with an optional twilight set' },
      { id: 'pkg-ava-video', service: 'videography', name: 'Walkthrough film', hours: 3, priceCents: 90000, deliverables: 'A 60-second walkthrough film with a still set' },
    ],
    portfolio: [
      { kind: 'photo', title: 'Griffith Observatory at dusk', contribution: 'Chose the tripod positions and managed the twilight bracket sequence.', media: IMG.griffithDusk, projectLabel: 'Architecture · Griffith Park' },
      { kind: 'photo', title: 'Echo Park Lake skyline', contribution: 'Shot the lake view for a property listing and graded the set.', media: IMG.echoPark, projectLabel: 'Real estate · Echo Park' },
      { kind: 'photo', title: 'Getty Center travertine', contribution: 'Architectural detail series, shot in soft morning light.', media: IMG.gettySunset, projectLabel: 'Architecture detail study' },
      { kind: 'video', title: 'Los Feliz walkthrough preview', contribution: 'Filmed and edited the walkthrough film. Preview frame shown.', media: IMG.griffithTwilight, projectLabel: 'Walkthrough film · Los Feliz' },
    ],
    availableDays: [1, 6, 8, 13, 15, 20],
  },
  {
    email: 'jonah@example.com',
    name: 'Jonah Reyes',
    bio: 'Former set photographer turned architecture photographer. I work in Hollywood and the hills with a medium-format camera and a patient approach to light. Clients who want careful, slow-paced work with precise delivery tend to enjoy working with me.',
    services: 'photography',
    specialties: ['Architecture', 'Hospitality spaces'],
    styles: ['Architectural', 'Editorial'],
    neighborhoods: ['Hollywood', 'Hollywood Hills', 'Los Feliz', 'Griffith Park'],
    citywide: false,
    seeking: false,
    years: 14,
    weekdays: [2, 3, 4],
    hours: '10:00-16:00',
    packages: [
      { id: 'pkg-jonah-half', service: 'photography', name: 'Architecture half-day', hours: 4, priceCents: 65000, deliverables: '30 images, web and print sizes' },
    ],
    portfolio: [
      { kind: 'photo', title: 'Hollywood Sign overlook', contribution: 'Planned the hill access and shot the overlook at blue hour.', media: IMG.hollywoodSign, projectLabel: 'Editorial · Hollywood Hills' },
      { kind: 'photo', title: 'Concert Hall steel study', contribution: 'Architectural study of the exterior, shot with a medium-format body.', media: IMG.disneyHall, projectLabel: 'Architecture study · Downtown LA' },
      { kind: 'photo', title: 'Perspective grid', contribution: 'Graphic study used for a hospitality lookbook.', media: IMG.abstract(6), projectLabel: 'Hospitality lookbook' },
    ],
    availableDays: [],
  },
  {
    email: 'nia@example.com',
    name: 'Nia Brooks',
    bio: 'Live-session and music video director based on the east side. I light for mood first, capture performances with two cameras, and cut for the rhythm of the track. I work with independent musicians, venues and labels on tight schedules and clear deliverables.',
    services: 'videography',
    specialties: ['Music videos', 'Live sessions', 'Event recaps'],
    styles: ['Gritty & raw', 'Moody & cinematic'],
    neighborhoods: ['Boyle Heights', 'Downtown LA', 'Highland Park', 'Exposition Park'],
    citywide: false,
    seeking: true,
    years: 7,
    weekdays: [3, 4, 5, 6],
    hours: '12:00-23:00',
    packages: [
      { id: 'pkg-nia-live', service: 'videography', name: 'Live session', hours: 5, priceCents: 145000, deliverables: 'Two 60-second performance cuts and a mixed audio track' },
      { id: 'pkg-nia-video-day', service: 'videography', name: 'Music video day', hours: 10, priceCents: 320000, deliverables: 'Up to a three-minute music video and two social cuts' },
    ],
    portfolio: [
      { kind: 'video', title: 'Light-bar session', contribution: 'Directed the lighting plan and edited the performance cut.', media: IMG.abstract(8), projectLabel: 'Live session · Boyle Heights' },
      { kind: 'video', title: 'Freeway night, the track', contribution: 'Shot the night sequence on the 101 overpasses with a gimbal and cut to the beat.', media: IMG.freewayNight, projectLabel: 'Music video · Downtown LA' },
      { kind: 'video', title: 'Light trails', contribution: 'Long-exposure motion sequence for a single.', media: IMG.abstract(1), projectLabel: 'Music video inserts' },
    ],
    availableDays: [5, 6, 12, 19],
  },
  {
    email: 'theo@example.com',
    name: 'Theo Lindqvist',
    bio: 'Food and hospitality photographer. I shoot menus, dishes, interiors and the details that make a restaurant feel like itself. Clients get a clear shot list, a warm, natural look, and images sized for menus, websites and social channels.',
    services: 'photography',
    specialties: ['Food & hospitality', 'Interiors', 'Menus'],
    styles: ['Warm & lifestyle', 'Editorial'],
    neighborhoods: ['Venice', 'Mar Vista', 'Westwood', 'Brentwood', 'Sawtelle'],
    citywide: false,
    seeking: true,
    years: 10,
    weekdays: [1, 2, 3, 4, 5],
    hours: '09:00-17:00',
    packages: [
      { id: 'pkg-theo-menu', service: 'photography', name: 'Menu & food', hours: 3, priceCents: 65000, deliverables: '25 images for menus and social channels' },
      { id: 'pkg-theo-hospitality', service: 'photography', name: 'Hospitality day', hours: 6, priceCents: 115000, deliverables: '50 images of food, interiors and details' },
    ],
    portfolio: [
      { kind: 'photo', title: 'Courtyard, late afternoon', contribution: 'Lit the courtyard with reflectors and shot the tables before service.', media: IMG.palmSunset, projectLabel: 'Hospitality · Venice' },
      { kind: 'photo', title: 'Menu still, red sun', contribution: 'Styled and shot the menu cover and two signature dishes.', media: IMG.abstract(2), projectLabel: 'Menu refresh · Westwood' },
      { kind: 'photo', title: 'Dinner service bokeh', contribution: 'Detail images of service, captured without identifiable guests.', media: IMG.abstract(4), projectLabel: 'Social content · Mar Vista' },
    ],
    availableDays: [1, 4, 7, 11],
  },
  {
    email: 'sunny@example.com',
    name: 'Sunny Okafor',
    bio: 'Event and social photographer and recap filmmaker, working citywide. I cover launches, community events and creator nights, delivering same-day selects for social channels and a short recap film for the client’s archive.',
    services: 'both',
    specialties: ['Events', 'Social content', 'Recap films'],
    styles: ['Bold & graphic', 'Documentary'],
    neighborhoods: [],
    citywide: true,
    seeking: true,
    years: 6,
    weekdays: [4, 5, 6],
    hours: '14:00-23:00',
    packages: [
      { id: 'pkg-sunny-event', service: 'photography', name: 'Event coverage', hours: 5, priceCents: 125000, deliverables: '120 images with same-day selects' },
      { id: 'pkg-sunny-recap', service: 'videography', name: 'Event recap', hours: 5, priceCents: 140000, deliverables: 'A 90-second recap film' },
    ],
    portfolio: [
      { kind: 'photo', title: 'Launch night light columns', contribution: 'Covered the room and delivered same-day selects for social.', media: IMG.abstract(3), projectLabel: 'Launch event · Downtown LA' },
      { kind: 'photo', title: 'City Hall at dusk', contribution: 'Architecture coverage used as the opening shot of a civic event recap.', media: IMG.cityHall, projectLabel: 'Event recap · Civic Center' },
      { kind: 'video', title: 'Recap: Getty evening', contribution: 'Edited the 90-second recap and mixed the event audio.', media: IMG.gettyHaze, projectLabel: 'Event recap · Westwood' },
    ],
    availableDays: [5, 6, 12, 13],
  },
  {
    email: 'lucia@example.com',
    name: 'Lucia Ferraro',
    bio: 'Fashion and lookbook photographer with a bold editorial eye. I plan each look with the client, direct posing and movement, and deliver final images with consistent colour across the set. I like tight timelines and clear sign-off points.',
    services: 'photography',
    specialties: ['Fashion & lookbook', 'Campaigns', 'Editorial'],
    styles: ['Editorial', 'Bold & graphic'],
    neighborhoods: ['Downtown LA', 'Arts District', 'Hollywood', 'Westlake'],
    citywide: false,
    seeking: true,
    years: 12,
    weekdays: [1, 2, 3, 4, 6],
    hours: '09:00-19:00',
    packages: [
      { id: 'pkg-lucia-lookbook', service: 'photography', name: 'Lookbook day', hours: 6, priceCents: 190000, deliverables: '50 final images across three looks per set' },
      { id: 'pkg-lucia-campaign', service: 'photography', name: 'Campaign day', hours: 10, priceCents: 310000, deliverables: '80 final images and three hero frames' },
    ],
    portfolio: [
      { kind: 'photo', title: 'Rooftop light, Downtown', contribution: 'Directed the poses and the colour palette for the lookbook.', media: IMG.capitolRecords, projectLabel: 'Lookbook · Arts District' },
      { kind: 'photo', title: 'Campaign backdrop', contribution: 'Built the backdrop and lit the hero frames.', media: IMG.gettySunset, projectLabel: 'Campaign · Hollywood' },
      { kind: 'photo', title: 'Bold shadow study', contribution: 'Graphic study of light and shadow for the moodboard.', media: IMG.abstract(5), projectLabel: 'Editorial study' },
    ],
    availableDays: [1, 2, 9, 10, 17],
  },
];

interface SeedCustomer {
  email: string;
  name: string;
  bio: string;
  customerType: 'individual' | 'business';
  businessName: string;
  neighborhood: string;
  interests: string[];
}

const CUSTOMERS: SeedCustomer[] = [
  {
    email: 'studio@example.com',
    name: 'Harbor & Pine Studio',
    bio: 'Harbor & Pine is a Downtown Los Angeles design studio producing seasonal lookbooks, product stories and event recaps for independent labels and food brands. We work with a small roster of photographers and videographers and expect clear briefs, dependable schedules and clean delivery.',
    customerType: 'business',
    businessName: 'Harbor & Pine Studio',
    neighborhood: 'Arts District',
    interests: ['Fashion & editorial', 'Brand campaigns', 'Product photography'],
  },
  {
    email: 'realty@example.com',
    name: 'Northline Realty',
    bio: 'Northline Realty represents owners and developers across Los Angeles, from Silver Lake to San Pedro. We need consistent architectural photography and short walkthrough films for listings and social channels, booked well ahead of open houses.',
    customerType: 'business',
    businessName: 'Northline Realty',
    neighborhood: 'Los Feliz',
    interests: ['Real estate', 'Social content'],
  },
  {
    email: 'lena@example.com',
    name: 'Lena Morales',
    bio: 'Brand builder running a small coffee roastery in Highland Park. I need short-form video and product photos for social channels and a seasonal campaign. I value clear timelines and creators who communicate early.',
    customerType: 'individual',
    businessName: '',
    neighborhood: 'Highland Park',
    interests: ['Social content', 'Food & hospitality', 'Brand campaigns'],
  },
];

function seedUser(db: Db, input: { email: string; name: string; bio: string; role: 'customer' | 'creator' }): UserRow {
  const id = insertUser(db, {
    email: input.email,
    passwordHash: hashPassword(DEMO_PASSWORD),
    role: input.role,
    name: input.name,
    bio: input.bio,
    isDemo: true,
  });
  return getUserRow(db, id) as UserRow;
}

function seedCreator(db: Db, c: SeedCreator): UserRow {
  const user = seedUser(db, { email: c.email, name: c.name, bio: c.bio, role: 'creator' });
  const now = nowIso();
  run(
    db,
    `INSERT INTO creator_profiles (user_id, services, specialties, styles, neighborhoods, citywide, seeking_clients, years_experience, weekdays, typical_hours, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    c.services,
    JSON.stringify(c.specialties),
    JSON.stringify(c.styles),
    JSON.stringify(c.neighborhoods),
    c.citywide ? 1 : 0,
    c.seeking ? 1 : 0,
    c.years,
    JSON.stringify(c.weekdays),
    c.hours,
    now,
  );
  c.packages.forEach((p, index) => {
    run(
      db,
      'INSERT INTO creator_packages (id, creator_id, service, name, hours, price_cents, deliverables, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      p.id,
      user.id,
      p.service,
      p.name,
      p.hours,
      p.priceCents,
      p.deliverables,
      index,
    );
  });
  c.portfolio.forEach((item, index) => {
    run(
      db,
      `INSERT INTO portfolio_items (id, creator_id, kind, title, contribution, media_url, poster_url, project_label, is_demo, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      newId(),
      user.id,
      item.kind,
      item.title,
      item.contribution,
      item.media,
      item.kind === 'video' ? item.media : null,
      item.projectLabel,
      index,
      now,
    );
  });
  for (const day of c.availableDays) {
    run(db, 'INSERT OR IGNORE INTO availability_dates (creator_id, date) VALUES (?, ?)', user.id, addDaysIso(todayIso(), day));
  }
  return user;
}

function seedCustomer(db: Db, c: SeedCustomer): UserRow {
  const user = seedUser(db, { email: c.email, name: c.name, bio: c.bio, role: 'customer' });
  run(
    db,
    'INSERT INTO customer_profiles (user_id, customer_type, business_name, interests, neighborhood, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    user.id,
    c.customerType,
    c.businessName,
    JSON.stringify(c.interests),
    c.neighborhood,
    nowIso(),
  );
  return user;
}

function markDemoDates(db: Db, projectId: string): void {
  run(db, 'UPDATE projects SET is_demo = 1 WHERE id = ?', projectId);
}

function payFromSeed(db: Db, customer: UserRow, projectId: string, kind: 'deposit' | 'balance'): void {
  const totals = acceptedQuoteTotals(db, projectId);
  if (!totals) throw new Error(`Seed: project ${projectId} has no agreed brief`);
  const paid = get<{ total: number | null }>(db, "SELECT SUM(amount_cents) AS total FROM payments WHERE project_id = ? AND kind = 'deposit' AND status = 'succeeded'", projectId)?.total ?? 0;
  const amount = kind === 'deposit' ? totals.depositCents : totals.totalCents - paid;
  const id = newId();
  const now = nowIso();
  // The seeded customer accepts the current policy at checkout, as a real customer would before paying the deposit.
  if (kind === 'deposit') recordPolicyAcceptance(db, customer.id, projectId, 'checkout', currentVersions(), now);
  run(
    db,
    `INSERT INTO payments (id, project_id, kind, amount_cents, provider, provider_ref, client_secret, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'demo', ?, NULL, 'requires_payment', ?, ?, ?)`,
    id,
    projectId,
    kind,
    amount,
    `demo_pi_seed_${id}`,
    customer.id,
    now,
    now,
  );
  applySucceeded(db, id);
}

/** Moves a seeded project through the real domain functions so the data is internally consistent. */
function agreeAndBook(
  db: Db,
  customer: UserRow,
  team: Array<{ user: UserRow; packageId: string }>,
  project: ProjectCreateInput,
): string {
  const detail = createProject(db, customer, { ...project, invites: team.map((t) => ({ creatorId: t.user.id, packageId: t.packageId })) });
  const projectId = detail.id;
  for (const member of team) setMemberResponse(db, member.user, projectId, 'accept', currentVersions());
  sendAgreement(db, customer, projectId);
  const pending = buildDetail(db, requireProject(db, projectId), null).pending;
  if (pending) {
    for (const approver of pending.approvers) {
      const user = getUserRow(db, approver.userId) as UserRow;
      approveVersion(db, user, projectId, pending.id);
    }
  }
  markDemoDates(db, projectId);
  return projectId;
}

function baseProject(overrides: Partial<ProjectCreateInput> & Pick<ProjectCreateInput, 'title' | 'contentType' | 'services' | 'budgetCents' | 'neighborhood'>): ProjectCreateInput {
  return {
    locationDetail: '',
    styleTags: [],
    preferredDates: [],
    description: '',
    visibility: 'invite',
    invites: [],
    photoCount: 40,
    videoCount: 0,
    videoLengthSeconds: 60,
    includedRevisions: 2,
    usageRights: 'social-web-12m',
    ...overrides,
  };
}

export function seedDemoData(db: Db, options: { force?: boolean } = {}): boolean {
  const existing = get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM users')?.count ?? 0;
  if (existing > 0 || options.force === false) return false;

  const creators = new Map<string, UserRow>();
  for (const c of CREATORS) creators.set(c.email, seedCreator(db, c));
  const customers = new Map<string, UserRow>();
  for (const c of CUSTOMERS) customers.set(c.email, seedCustomer(db, c));
  const creator = (email: string) => creators.get(email) as UserRow;
  const customer = (email: string) => customers.get(email) as UserRow;
  const today = todayIso();

  // A. Completed lookbook: both roles, reviewed both ways.
  const lookbook = agreeAndBook(
    db,
    customer('studio@example.com'),
    [
      { user: creator('lucia@example.com'), packageId: 'pkg-lucia-lookbook' },
      { user: creator('devon@example.com'), packageId: 'pkg-devon-social' },
    ],
    baseProject({
      title: 'Spring lookbook and social cut',
      contentType: 'Fashion & lookbook',
      services: 'both',
      budgetCents: 400000,
      neighborhood: 'Arts District',
      locationDetail: 'Warehouse studio on Mateo Street',
      styleTags: ['Editorial', 'Bold & graphic'],
      preferredDates: [addDaysIso(today, -45)],
      description: 'Spring lookbook photography with a vertical social cut for launch week.',
    }),
  );
  payFromSeed(db, customer('studio@example.com'), lookbook, 'deposit');
  postMessage(db, customer('studio@example.com'), lookbook, 'Thanks for the call. Could we start the first look at 10am?');
  postMessage(db, creator('lucia@example.com'), lookbook, 'Yes, 10am works. I will send the shot list tomorrow.');
  addDelivery(db, creator('lucia@example.com'), lookbook, { fileName: 'lookbook-selects-01.jpg', fileUrl: IMG.capitolRecords, kind: 'photo', sizeBytes: 480000, note: 'Final retouched selects' });
  addDelivery(db, creator('devon@example.com'), lookbook, { fileName: 'social-cut-vertical.mp4', fileUrl: IMG.palmSunset, kind: 'video', sizeBytes: 9200000, note: 'Vertical 30-second cut' });
  confirmCompletion(db, customer('studio@example.com'), lookbook);
  payFromSeed(db, customer('studio@example.com'), lookbook, 'balance');
  createReview(db, customer('studio@example.com'), lookbook, { revieweeId: creator('lucia@example.com').id, communication: 5, reliability: 5, professionalism: 5, quality: 5, expectationsMet: true, body: 'Lucia planned every look with us, kept the schedule and delivered colour-consistent finals in under a week. We would book again for our autumn lookbook.' });
  createReview(db, customer('studio@example.com'), lookbook, { revieweeId: creator('devon@example.com').id, communication: 4, reliability: 5, professionalism: 5, quality: 4, expectationsMet: true, body: 'Devon delivered a clean vertical cut on time. Two rounds of notes were handled quickly and the captions were accurate.' });
  createReview(db, creator('lucia@example.com'), lookbook, { revieweeId: customer('studio@example.com').id, communication: 5, reliability: 5, professionalism: 4, quality: 5, expectationsMet: true, body: 'Harbor & Pine sent a clear brief, decisions came fast on the day and the approvals were straightforward. A pleasure to work with.' });
  createReview(db, creator('devon@example.com'), lookbook, { revieweeId: customer('studio@example.com').id, communication: 5, reliability: 4, professionalism: 4, quality: 4, expectationsMet: true, body: 'Clear expectations from the brief and quick feedback on the first cut. Payment and approvals happened as agreed.' });

  // B. Completed listing walkthrough, reviewed by both sides.
  const listing = agreeAndBook(
    db,
    customer('realty@example.com'),
    [{ user: creator('ava@example.com'), packageId: 'pkg-ava-photo' }],
    baseProject({
      title: 'Hillside listing: architecture photos',
      contentType: 'Real estate & architecture',
      services: 'photography',
      budgetCents: 90000,
      neighborhood: 'Los Feliz',
      locationDetail: 'Listing on a hillside street above Griffith Park',
      styleTags: ['Architectural', 'Clean & bright'],
      preferredDates: [addDaysIso(today, -30)],
      description: 'Architecture photography for a hillside home listing, including a twilight set.',
    }),
  );
  payFromSeed(db, customer('realty@example.com'), listing, 'deposit');
  addDelivery(db, creator('ava@example.com'), listing, { fileName: 'listing-set-final.jpg', fileUrl: IMG.griffithDusk, kind: 'photo', sizeBytes: 520000, note: 'Final set, 35 images' });
  confirmCompletion(db, customer('realty@example.com'), listing);
  payFromSeed(db, customer('realty@example.com'), listing, 'balance');
  createReview(db, customer('realty@example.com'), listing, { revieweeId: creator('ava@example.com').id, communication: 5, reliability: 5, professionalism: 5, quality: 5, expectationsMet: true, body: 'Ava handled light, timing and the twilight set precisely. The listing went live a day early with the full set.' });
  createReview(db, creator('ava@example.com'), listing, { revieweeId: customer('realty@example.com').id, communication: 4, reliability: 5, professionalism: 5, quality: 4, expectationsMet: true, body: 'Northline sent accurate room notes and access details ahead of time. The brief matched what we shot.' });

  // C. Completed coffee reel: a videographer reviewed by an individual client.
  const reel = agreeAndBook(
    db,
    customer('lena@example.com'),
    [{ user: creator('nia@example.com'), packageId: 'pkg-nia-live' }],
    baseProject({
      title: 'Roastery live-session reel',
      contentType: 'Social media content',
      services: 'videography',
      budgetCents: 160000,
      neighborhood: 'Highland Park',
      locationDetail: 'Roastery floor, Figueroa side street',
      styleTags: ['Gritty & raw', 'Moody & cinematic'],
      preferredDates: [addDaysIso(today, -20)],
      description: 'A short reel showing the roasting process and a live acoustic set for the launch.',
    }),
  );
  payFromSeed(db, customer('lena@example.com'), reel, 'deposit');
  addDelivery(db, creator('nia@example.com'), reel, { fileName: 'roastery-reel-60s.mp4', fileUrl: IMG.abstract(8), kind: 'video', sizeBytes: 14200000, note: '60-second reel and two vertical cuts' });
  confirmCompletion(db, customer('lena@example.com'), reel);
  payFromSeed(db, customer('lena@example.com'), reel, 'balance');
  createReview(db, customer('lena@example.com'), reel, { revieweeId: creator('nia@example.com').id, communication: 5, reliability: 4, professionalism: 5, quality: 5, expectationsMet: true, body: 'Nia was focused on the day, asked the right questions about the roast process, and the cut captured the mood we wanted.' });
  createReview(db, creator('nia@example.com'), reel, { revieweeId: customer('lena@example.com').id, communication: 5, reliability: 5, professionalism: 5, quality: 4, expectationsMet: true, body: 'Lena gave clear direction and approved the rough cut quickly. The timeline was realistic and easy to follow.' });

  // D. Completed menu session for Theo, reviewed by an individual client.
  const menu = agreeAndBook(
    db,
    customer('lena@example.com'),
    [{ user: creator('theo@example.com'), packageId: 'pkg-theo-menu' }],
    baseProject({
      title: 'Menu photos for a Venice café',
      contentType: 'Food & hospitality',
      services: 'photography',
      budgetCents: 80000,
      neighborhood: 'Venice',
      locationDetail: 'Café on Abbot Kinney',
      styleTags: ['Warm & lifestyle'],
      preferredDates: [addDaysIso(today, -12)],
      description: 'Menu and food photography for a refreshed café menu.',
    }),
  );
  payFromSeed(db, customer('lena@example.com'), menu, 'deposit');
  addDelivery(db, creator('theo@example.com'), menu, { fileName: 'menu-finals.jpg', fileUrl: IMG.abstract(2), kind: 'photo', sizeBytes: 430000, note: '25 menu and food images' });
  confirmCompletion(db, customer('lena@example.com'), menu);
  payFromSeed(db, customer('lena@example.com'), menu, 'balance');
  createReview(db, customer('lena@example.com'), menu, { revieweeId: creator('theo@example.com').id, communication: 4, reliability: 5, professionalism: 5, quality: 5, expectationsMet: true, body: 'Theo styled the dishes beautifully and delivered the menu set early. Clear communication before the shoot made the day easy.' });

  // E. Booked walkthrough two weeks out: both roles, deposit paid.
  const walkthrough = agreeAndBook(
    db,
    customer('realty@example.com'),
    [
      { user: creator('ava@example.com'), packageId: 'pkg-ava-photo' },
      { user: creator('devon@example.com'), packageId: 'pkg-devon-film' },
    ],
    baseProject({
      title: 'Los Feliz walkthrough film and stills',
      contentType: 'Real estate & architecture',
      services: 'both',
      budgetCents: 400000,
      neighborhood: 'Los Feliz',
      locationDetail: 'Mid-century home on a quiet street',
      styleTags: ['Architectural', 'Documentary'],
      preferredDates: [addDaysIso(today, 9)],
      description: 'A 60-second walkthrough film and a still set for the upcoming listing.',
    }),
  );
  payFromSeed(db, customer('realty@example.com'), walkthrough, 'deposit');
  postMessage(db, customer('realty@example.com'), walkthrough, 'Access is confirmed for the morning. The owners prefer quiet work during the first hour.');

  // F. Open call: anyone who covers Silver Lake can express interest.
  const openCall = createProject(
    db,
    customer('lena@example.com'),
    baseProject({
      title: 'Coffee brand social video, six cuts',
      contentType: 'Social media content',
      services: 'videography',
      budgetCents: 200000,
      neighborhood: 'Silver Lake',
      locationDetail: 'Community studio near Sunset Junction',
      styleTags: ['Documentary', 'Natural light'],
      preferredDates: [addDaysIso(today, 26)],
      description: 'Six short vertical cuts for a seasonal coffee launch. Documentary style, natural light and clear captions.',
      visibility: 'open',
    }),
  );
  markDemoDates(db, openCall.id);

  // G. Agreement waiting for approvals from the customer and Marisol.
  const mural = createProject(
    db,
    customer('studio@example.com'),
    baseProject({
      title: 'Mural wall campaign, Chinatown',
      contentType: 'Brand campaign',
      services: 'photography',
      budgetCents: 120000,
      neighborhood: 'Chinatown',
      locationDetail: 'Alley wall off Hill Street',
      styleTags: ['Bold & graphic', 'Clean & bright'],
      preferredDates: [addDaysIso(today, 33)],
      description: 'Photography for a mural wall campaign and social rollout.',
      invites: [{ creatorId: creator('marisol@example.com').id, packageId: 'pkg-marisol-half' }],
    }),
  );
  setMemberResponse(db, creator('marisol@example.com'), mural.id, 'accept', currentVersions());
  sendAgreement(db, customer('studio@example.com'), mural.id);
  markDemoDates(db, mural.id);

  // H. Recruiting: a brief with one invitation still waiting for a response.
  const recruiting = createProject(
    db,
    customer('realty@example.com'),
    baseProject({
      title: 'Downtown lofts photo series',
      contentType: 'Real estate & architecture',
      services: 'photography',
      budgetCents: 150000,
      neighborhood: 'Arts District',
      locationDetail: 'Three lofts on the same block',
      styleTags: ['Architectural'],
      preferredDates: [addDaysIso(today, 40)],
      description: 'Architectural stills for three loft listings.',
      invites: [{ creatorId: creator('marisol@example.com').id, packageId: 'pkg-marisol-full' }],
    }),
  );
  markDemoDates(db, recruiting.id);

  return true;
}
