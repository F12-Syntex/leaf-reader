import { getBookIndex } from '@/lib/books';
import LibraryView from '@/components/library/LibraryView';

export default async function LibraryPage() {
  const books = await getBookIndex();
  return <LibraryView initialBooks={books} />;
}
