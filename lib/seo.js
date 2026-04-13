const BASE_URL = 'https://florida-donor-tracker.vercel.app';

export function buildMeta({ title, description, path }) {
  const meta = { title };
  if (description) {
    meta.description = description;
    meta.openGraph = {
      title,
      description,
      url: path ? `${BASE_URL}${path}` : undefined,
    };
  }
  return meta;
}
