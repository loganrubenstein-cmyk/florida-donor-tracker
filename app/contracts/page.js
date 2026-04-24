import ContractsList from '@/components/contracts/ContractsList';

export const revalidate = 1800;

export const metadata = {
  title: 'Florida State Contracts',
  description: 'Search Florida state vendor contracts and see which companies also donate to Florida politicians',
};

export default function ContractsPage() {
  return <ContractsList />;
}
