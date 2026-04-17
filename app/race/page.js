import { redirect } from 'next/navigation';

// /race has no index — redirect to candidates where race links are surfaced on each profile
export default function RaceIndex() {
  redirect('/candidates');
}
