import CommitteeDecoder from '@/components/tools/CommitteeDecoder';

export const metadata = {
  title: 'Committee Decoder',
  description: 'Decode any Florida political committee — see who really funds it, which industries back it, and which candidates it supports.',
};

export default function DecodePage() {
  return <CommitteeDecoder />;
}
