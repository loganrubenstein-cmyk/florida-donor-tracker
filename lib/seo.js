const BASE_URL = 'https://floridainfluence.com';
const OG_IMAGE = [{ url: '/og-image.png', width: 1200, height: 630 }];

export function buildMeta({ title, description, path }) {
  const meta = { title };
  if (description) {
    meta.description = description;
    meta.openGraph = {
      title,
      description,
      url: path ? `${BASE_URL}${path}` : undefined,
      images: OG_IMAGE,
    };
    meta.twitter = { card: 'summary_large_image', images: ['/og-image.png'] };
  }
  return meta;
}
