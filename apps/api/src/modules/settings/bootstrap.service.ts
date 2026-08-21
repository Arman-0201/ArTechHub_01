import type { SiteBootstrapDto } from '@academy/types';
import { getSettings } from './settings.service.js';
import { getActiveLanguages } from '../languages/languages.service.js';
import { getFeatureFlags } from '../feature-flags/feature-flags.service.js';
import { getFooter, getMenu, MENU_SLUGS } from '../menus/menus.service.js';
import { getLegalLinks } from '../legal/legal.service.js';

/**
 * One request that returns everything the web app needs to render its chrome.
 *
 * Without this the layout would fire five round trips before painting a header.
 * Every part is individually cached, so the aggregate is cheap; the response
 * varies by locale and by the caller's roles, which is why role-filtered menus
 * are built here rather than shared between users.
 */
export async function getSiteBootstrap(input: {
  locale: string;
  roleSlugs: string[];
}): Promise<SiteBootstrapDto> {
  const [settings, languages, features, headerMenu, footerMenu, footer, legalLinks] =
    await Promise.all([
      getSettings(),
      getActiveLanguages(),
      getFeatureFlags(),
      getMenu(MENU_SLUGS.header, { ...input, includeHidden: false }),
      getMenu(MENU_SLUGS.footer, { ...input, includeHidden: false }),
      getFooter(),
      getLegalLinks(),
    ]);

  return {
    settings,
    languages,
    features,
    menus: { header: headerMenu, footer: footerMenu },
    footer: {
      ...footer,
      socialLinks: settings.socialLinks,
      copyright:
        settings.footerNote ?? `© ${new Date().getFullYear()} ${settings.siteName}. All rights reserved.`,
    },
    legalLinks,
  };
}
