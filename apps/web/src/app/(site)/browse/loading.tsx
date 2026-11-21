// SPDX-License-Identifier: AGPL-3.0-only

/** Stands in for a page while it is being built: the shape of a heading and a row of posters. */
export default function Loading() {
  return (
    <div className="gutter pt-28" role="status">
      <span className="sr-only">Loading</span>
      <div className="h-12 w-72 max-w-full animate-pulse bg-ash" />
      <div className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-x-[clamp(0.5rem,1vw,0.875rem)] gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="aspect-[2/3] animate-pulse rounded-[3px] bg-ash" />
        ))}
      </div>
    </div>
  );
}
