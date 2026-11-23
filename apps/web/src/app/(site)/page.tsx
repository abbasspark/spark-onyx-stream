// SPDX-License-Identifier: AGPL-3.0-only
import { PageLayout } from '@/components/page-layout';
import { getHome } from '@/lib/api';
import { siteConfig } from '@/lib/config';
import { isEmptyHome } from '@/lib/home';

export default async function HomePage() {
  const home = await getHome();

  if (isEmptyHome(home)) {
    return (
      <div className="gutter flex min-h-[70dvh] flex-col justify-center pt-24">
        <h1 className="display max-w-3xl text-4xl sm:text-5xl">Nothing to watch yet</h1>
        <p className="mt-6 max-w-xl text-lg text-smoke">
          {siteConfig.name} has no published titles at the moment. Come back soon.
        </p>
      </div>
    );
  }
  return <PageLayout page={home} heading={siteConfig.name} />;
}
