import { CreatePageBody } from '../../components/CreatePageBody';
import { decodePrefill } from '../../lib/prefill';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { prefill?: string; url?: string };
}

export default function CreatePage({ searchParams }: PageProps) {
  const prefill = searchParams.prefill ? decodePrefill(searchParams.prefill) : null;
  return (
    <CreatePageBody
      {...(prefill ? { prefill } : {})}
      {...(searchParams.url && !prefill ? { initialUrl: searchParams.url } : {})}
    />
  );
}
