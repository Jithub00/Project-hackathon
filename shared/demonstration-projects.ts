import type { BoardListing, CreativeRole } from './project-board';

/**
 * Sample briefs for the project board. They are static and fictional: nothing here is stored, and the
 * pages that show them create no bookings, payments, messages or applications.
 */

export const DEMONSTRATION_LABEL = 'Demonstration Project';
export const LOS_ANGELES_TIME_ZONE = 'America/Los_Angeles';

export type ProjectSetting = 'indoor' | 'outdoor' | 'both';

export interface DemonstrationRole {
  role: CreativeRole;
  /** Pay for this role in cents. Omitted when the role is paid from the total project budget. */
  payCents?: number;
  responsibilities: string[];
}

export interface DemonstrationProject {
  slug: string;
  title: string;
  neighborhood: string;
  setting: ProjectSetting;
  settingNote: string;
  /** Shoot window as ISO timestamps with the Los Angeles offset (Pacific Standard Time in December). */
  shootStart: string;
  shootEnd: string;
  /** Total project budget in cents, including editing. */
  budgetCents: number;
  compensationIncludes: string;
  roles: DemonstrationRole[];
  /** Exactly two sentences. */
  overview: string;
  creativeGoals: string[];
  customer: { businessName: string; contactName: string; description: string };
  deliverables: string[];
  /** ISO timestamp with the Los Angeles offset. */
  deliveryDeadline: string;
  visualStyle: string;
  equipment: { applicant: string[]; customer: string[] };
  travel: string;
  usage: string;
  submission: string[];
  image: { src: string; alt: string };
}

export const DEMONSTRATION_PROJECTS: readonly DemonstrationProject[] = [
  {
    slug: 'independent-clothing-brand-launch',
    title: 'Independent Clothing Brand Launch',
    neighborhood: 'Arts District',
    setting: 'both',
    settingNote: 'An indoor studio with nearby outdoor locations. Both are agreed during planning and are a short drive apart.',
    shootStart: '2026-12-05T10:00:00-08:00',
    shootEnd: '2026-12-05T14:00:00-08:00',
    budgetCents: 140_000,
    compensationIncludes: 'Both fees include editing, colour correction and export for every deliverable, plus one 60-minute planning call before the shoot. There is no separate preparation fee.',
    roles: [
      {
        role: 'photographer',
        payCents: 65_000,
        responsibilities: [
          'Plan and shoot garment details and full looks in the studio and at the outdoor locations.',
          'Keep colour and lighting consistent across the whole set.',
          'Cull and edit down to 20 final photographs.',
        ],
      },
      {
        role: 'videographer',
        payCents: 75_000,
        responsibilities: [
          'Shoot two vertical videos of 20 to 30 seconds each, following the brand’s on-set direction.',
          'Capture supporting footage of garment movement and detail.',
          'Edit and export both vertical videos.',
        ],
      },
    ],
    overview: 'A local clothing brand is preparing its first collection launch and needs coordinated photography and short-form video. The content should highlight garment details and create a consistent look across its website and social channels.',
    creativeGoals: [
      'Show garment details clearly: fabric, stitching, fit and finish.',
      'Create one consistent look across the website and social channels.',
      'Deliver two vertical clips that are ready to post on launch day.',
    ],
    customer: {
      businessName: 'Sable Ridge Apparel',
      contactName: 'Tessa Moreno, founder',
      description: 'An independent label founded in 2025. It sells online and at local pop-ups, and this is its first collection launch.',
    },
    deliverables: [
      '20 edited photographs, JPEG, sRGB, 2,400 px on the long edge.',
      'Two vertical videos of 20 to 30 seconds each, MP4, 1080 × 1920 (9:16).',
    ],
    deliveryDeadline: '2026-12-12T12:00:00-08:00',
    visualStyle: 'Clean and editorial. Soft, even light on garment details, colour that matches the fabric, and minimal props so the clothes stay the focus.',
    equipment: {
      applicant: [
        'Photographer: camera body, lenses and studio lighting (strobes or continuous light).',
        'Videographer: camera, gimbal or stabiliser, and a lavalier microphone.',
      ],
      customer: [
        'Studio space and access for the full shoot window.',
        'Garments, styling and any models.',
        'Props and backdrop materials.',
      ],
    },
    travel: 'The studio is in the Arts District and the outdoor locations are nearby. Travel within Los Angeles is included in both fees. Parking and tolls are reimbursed at cost with receipts.',
    usage: 'Proposed: unlimited use on the brand’s website, product pages and organic social channels for 12 months. Paid advertising, print and outdoor use need a separate agreement and fee.',
    submission: [
      'Two or three portfolio links, including product or fashion work or short vertical video.',
      'Availability for December 5, 2026 from 10 a.m. to 2 p.m., and your editing plan for the December 12 deadline.',
      'The role you are applying for, and confirmation that you accept the proposed fee.',
    ],
    image: { src: '/images/samples/clothing-launch-tee.jpg', alt: 'Black t-shirt flat-lay with a small white chest print on a warm grey studio backdrop. A product placeholder; no people shown.' },
  },
  {
    slug: 'neighborhood-cafe-content-refresh',
    title: 'Neighborhood Café Content Refresh',
    neighborhood: 'Echo Park',
    setting: 'both',
    settingNote: 'Inside the café and outside at the storefront. The shoot runs before the café opens, so the room is empty and the storefront is clear of foot traffic.',
    shootStart: '2026-12-06T08:00:00-08:00',
    shootEnd: '2026-12-06T11:00:00-08:00',
    budgetCents: 60_000,
    compensationIncludes: 'The total budget includes editing, colour correction and export for all 18 photographs. There is no separate preparation fee.',
    roles: [
      {
        role: 'photographer',
        responsibilities: [
          'Agree a shot list with the café team before the shoot.',
          'Photograph drinks, food, interior details and the storefront.',
          'Edit and deliver 18 final photographs.',
        ],
      },
    ],
    overview: 'An independent café wants fresh photographs for its menu, website, and social media. The project focuses on warm natural light, carefully styled drinks, and the character of the space.',
    creativeGoals: [
      'Show menu items in warm, natural light that feels like the café.',
      'Capture the room: textures, seating and light through the windows.',
      'Give the menu, website and social posts one consistent set of images.',
    ],
    customer: {
      businessName: 'Little Fig Coffee House',
      contactName: 'Owen Park, owner',
      description: 'A neighbourhood café in Echo Park with a seasonal menu. It is refreshing its photography across the menu, website and social channels.',
    },
    deliverables: [
      '18 edited photographs covering drinks, food, interior details and the storefront.',
      'JPEG, sRGB, 2,400 px on the long edge.',
    ],
    deliveryDeadline: '2026-12-11T12:00:00-08:00',
    visualStyle: 'Warm, natural and unhurried. Window light where possible, carefully styled drinks with real texture, and the café’s own character in the background.',
    equipment: {
      applicant: ['Camera body, lenses, reflectors and a small portable light for filling shadows.'],
      customer: [
        'Menu items to photograph, prepared and staged by the café team.',
        'Props and serving ware from the café.',
        'Access to the interior and storefront before opening hours.',
      ],
    },
    travel: 'The café is in Echo Park with street parking nearby. There is no travel fee within Los Angeles. Paid parking is reimbursed at cost with receipts.',
    usage: 'Proposed: use on the café’s menu, website and social channels for 12 months. Paid advertising needs a written agreement.',
    submission: [
      'Two or three portfolio links that include food, drink or interior photography.',
      'Availability on December 6, 2026 from 8 to 11 a.m., and confirmation that you can deliver by December 11.',
      'Confirmation that you accept the proposed total budget of $600, including editing.',
    ],
    image: { src: '/images/samples/la-03-echo-park-lake-skyline.jpg', alt: 'Echo Park Lake with the Downtown Los Angeles skyline at dusk. Location placeholder.' },
  },
  {
    slug: 'independent-music-performance-video',
    title: 'Independent Music Performance Video',
    neighborhood: 'North Hollywood',
    setting: 'indoor',
    settingNote: 'An indoor rehearsal studio. The room is controlled, so the lighting can be set in advance.',
    shootStart: '2026-12-12T12:00:00-08:00',
    shootEnd: '2026-12-12T17:00:00-08:00',
    budgetCents: 120_000,
    compensationIncludes: 'The total budget includes editing, grading and export for the 90-second video and the three vertical clips. The pre-production call is included.',
    roles: [
      {
        role: 'videographer',
        responsibilities: [
          'Plan camera positions and moves with the musician before the shoot.',
          'Operate cameras and lighting for the full performance and for close-ups.',
          'Edit the 90-second video and three 15-second vertical clips with one consistent grade.',
        ],
      },
    ],
    overview: 'An independent musician needs a performance video to support an upcoming release. The visual direction uses controlled lighting, deliberate camera movement, and a consistent cinematic treatment.',
    creativeGoals: [
      'Capture the performance with controlled lighting and deliberate camera moves.',
      'Keep one cinematic grade across the long video and the vertical clips.',
      'Produce clips ready to support the release on streaming and social platforms.',
    ],
    customer: {
      businessName: 'Juno Vale Music',
      contactName: 'Juno Vale, artist',
      description: 'An independent singer-songwriter preparing a new single and EP. The artist performs with a small band.',
    },
    deliverables: [
      'One edited performance video, 90 seconds, 16:9, MP4 at 1080p or higher.',
      'Three vertical clips of 15 seconds each, MP4, 1080 × 1920 (9:16).',
    ],
    deliveryDeadline: '2026-12-22T12:00:00-08:00',
    visualStyle: 'Cinematic and controlled. A low-key setup with a clear key light, slow and deliberate camera moves, and one colour grade across every output.',
    equipment: {
      applicant: [
        'Camera body with two lenses, and a backup battery plan.',
        'LED lighting kit for a low-key setup, with stands and modifiers.',
        'Gimbal or slider for controlled movement, and a recorder for scratch audio.',
      ],
      customer: [
        'Rehearsal studio access for the full shoot window.',
        'Instruments, band members and the performance setlist.',
        'A clean audio feed or multitrack recording for the final edit, if available.',
      ],
    },
    travel: 'The rehearsal studio is in North Hollywood. Travel within Los Angeles is included in the fee. Parking is reimbursed at cost with receipts.',
    usage: 'Proposed: the artist may publish the final video and vertical clips on official channels, streaming and social platforms for 24 months. The videographer may show excerpts in a portfolio after release. Paid advertising needs a separate agreement.',
    submission: [
      'Two or three portfolio links, including performance or music video work.',
      'Availability on December 12, 2026 from noon to 5 p.m., and confirmation that you can deliver by December 22.',
      'Confirmation that you accept the proposed total budget of $1,200, including editing.',
    ],
    image: { src: '/images/samples/abstract-08.jpg', alt: 'Abstract placeholder of a red light bar on black. No people shown.' },
  },
  {
    slug: 'architecture-and-interiors-showcase',
    title: 'Architecture and Interiors Showcase',
    neighborhood: 'Los Feliz',
    setting: 'both',
    settingNote: 'The residential interior and the exterior of a recently completed home. Both are shot on the same day.',
    shootStart: '2026-12-13T09:00:00-08:00',
    shootEnd: '2026-12-13T13:00:00-08:00',
    budgetCents: 160_000,
    compensationIncludes: 'Both fees include editing, perspective correction and colour for the 15 photographs, and export of the walkthrough video. A walkthrough planning call before the shoot is included.',
    roles: [
      {
        role: 'photographer',
        payCents: 85_000,
        responsibilities: [
          'Plan the shot list room by room with the studio.',
          'Photograph the interiors and exterior with correct perspective and natural light.',
          'Edit and deliver 15 architectural photographs.',
        ],
      },
      {
        role: 'videographer',
        payCents: 75_000,
        responsibilities: [
          'Plan and shoot a 45 to 60 second walkthrough that shows how the rooms connect.',
          'Capture close detail of materials and finishes.',
          'Edit and deliver the walkthrough video.',
        ],
      },
    ],
    overview: 'A small interior-design studio wants to document a recently completed residential project. Photography and video should emphasize materials, natural light, room flow, and the details of the finished design.',
    creativeGoals: [
      'Show materials, finishes and joinery clearly.',
      'Explain how the rooms connect and how daylight moves through the home.',
      'Produce a portfolio set the studio can use for proposals and its website.',
    ],
    customer: {
      businessName: 'Harlow & Reed Interiors',
      contactName: 'Elena Brandt, principal',
      description: 'A small interior-design studio in Los Angeles. It has just completed a residential project and wants a record of the finished work.',
    },
    deliverables: [
      '15 edited architectural photographs, JPEG, sRGB, 3,000 px on the long edge.',
      'One walkthrough video of 45 to 60 seconds, MP4, 1080p or 4K, 16:9.',
    ],
    deliveryDeadline: '2026-12-20T12:00:00-08:00',
    visualStyle: 'Calm and precise. Natural light first, straight verticals, neutral colour that matches the materials, and a walkthrough pace that lets viewers follow the layout.',
    equipment: {
      applicant: [
        'Photographer: camera, a wide-angle lens, a perspective-correction lens and a tripod.',
        'Videographer: camera, gimbal and a small LED light for shadow areas.',
      ],
      customer: [
        'Access to the completed home for the full shoot window.',
        'Lights and fixtures switched on, and furniture arranged as the studio intends.',
        'Keys and a site contact for the day.',
      ],
    },
    travel: 'The home is in Los Feliz. Travel within Los Angeles is included in both fees. Parking is reimbursed at cost with receipts.',
    usage: 'Proposed: the studio may use the photographs and walkthrough on its website, in proposals and on social channels for 24 months. Homeowner names and addresses are not published without written consent.',
    submission: [
      'Two or three portfolio links with interior or architectural work.',
      'Availability on December 13, 2026 from 9 a.m. to 1 p.m., and confirmation that you can deliver by December 20.',
      'The role you are applying for, and confirmation of the proposed fees: $850 for photography and $750 for video, within the $1,600 total.',
    ],
    image: { src: '/images/samples/la-06-griffith-observatory-twilight.jpg', alt: 'Griffith Observatory at twilight, near Los Feliz. Architecture placeholder.' },
  },
];

const longDate = new Intl.DateTimeFormat('en-US', { timeZone: LOS_ANGELES_TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('en-US', { timeZone: LOS_ANGELES_TIME_ZONE, month: 'long', day: 'numeric', year: 'numeric' });
const clock = new Intl.DateTimeFormat('en-US', { timeZone: LOS_ANGELES_TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const clockWithZone = new Intl.DateTimeFormat('en-US', { timeZone: LOS_ANGELES_TIME_ZONE, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

/** ICU puts a narrow no-break space before AM and PM. Plain spaces keep the text readable and searchable. */
function plain(text: string): string {
  return text.replace(/ /g, ' ');
}

/** "Saturday, December 5, 2026", in Los Angeles time. */
export function formatShootDate(iso: string): string {
  return plain(longDate.format(new Date(iso)));
}

/** "December 12, 2026", in Los Angeles time. */
export function formatDeadline(iso: string): string {
  return plain(shortDate.format(new Date(iso)));
}

/** "10:00 AM – 2:00 PM PST", in Los Angeles time. */
export function formatShootTimes(startIso: string, endIso: string): string {
  return plain(`${clock.format(new Date(startIso))} – ${clockWithZone.format(new Date(endIso))}`);
}

export function estimatedHours(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / 3_600_000;
}

export function formatHours(hours: number): string {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

export interface ShootSchedule {
  date: string;
  times: string;
  hours: number;
  duration: string;
}

export function shootSchedule(project: Pick<DemonstrationProject, 'shootStart' | 'shootEnd'>): ShootSchedule {
  const hours = estimatedHours(project.shootStart, project.shootEnd);
  return {
    date: formatShootDate(project.shootStart),
    times: formatShootTimes(project.shootStart, project.shootEnd),
    hours,
    duration: formatHours(hours),
  };
}

export function roleName(role: CreativeRole): 'Photographer' | 'Videographer' {
  return role === 'photographer' ? 'Photographer' : 'Videographer';
}

export function settingLabel(setting: ProjectSetting): string {
  if (setting === 'indoor') return 'Indoor';
  if (setting === 'outdoor') return 'Outdoor';
  return 'Indoor and outdoor';
}

export function findDemonstrationProject(slug: string | undefined): DemonstrationProject | undefined {
  return DEMONSTRATION_PROJECTS.find((project) => project.slug === slug);
}

export function demonstrationListing(project: DemonstrationProject): BoardListing {
  return {
    neighborhood: project.neighborhood,
    needs: project.roles.map((role) => role.role),
    budgetCents: project.budgetCents,
  };
}
