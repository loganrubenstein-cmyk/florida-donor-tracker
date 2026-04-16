import FederalContractsList from '@/components/contracts/FederalContractsList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Florida Federal Contracts',
  description: 'Federal contracts awarded to Florida recipients — cross-referenced with state campaign donors and FL state vendors.',
};

export default function FederalContractsPage() {
  return <FederalContractsList />;
}
